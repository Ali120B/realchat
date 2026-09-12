// chattt — WhatsApp service (Baileys v7, main process only).
// Owns the socket, auth (wa-auth/), snapshot cache (wa-cache/), media files.
// Renderer talks to it exclusively through whitelisted IPC in main.cjs.
const fs = require('node:fs')
const path = require('node:path')

const MSG_CAP = 300
const SNAPSHOT_MSGS = 100

function now() {
  return Date.now()
}

function prettyPhone(jid) {
  const digits = String(jid || '').split('@')[0].replace(/\D/g, '')
  if (!digits) return 'Unknown'
  // Standard phone grouping: +CC XXX XXX XXXX (tail 10 grouped 3-3-4)
  if (digits.length > 10) {
    const head = digits.slice(0, digits.length - 10)
    const t = digits.slice(-10)
    return `+${head} ${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}`
  }
  if (digits.length > 4) {
    const tail4 = digits.slice(-4)
    let rest = digits.slice(0, -4)
    const groups = []
    while (rest.length > 3) {
      groups.push(rest.slice(0, 3))
      rest = rest.slice(3)
    }
    if (rest) groups.push(rest)
    groups.push(tail4)
    return `+${groups.join(' ')}`
  }
  return `+${digits}`
}

// Chats we never show in the overlay list
function isJunkChat(id) {
  if (!id) return true
  if (id === 'status@broadcast') return true
  if (id.endsWith('@broadcast')) return true
  if (id.endsWith('@newsletter')) return true
  return false
}

// Protocol-only stanzas (edit/revoke echoes, reactions, key distribution) are handled
// via messages.update / messages.reaction — never render them as chat messages.
// Content-based check: edit echoes often carry messageContextInfo alongside
// protocolMessage, so key-counting is not enough.
function hasRenderableContent(m) {
  if (!m) return false
  return !!(
    m.conversation ||
    m.extendedTextMessage ||
    m.imageMessage ||
    m.videoMessage ||
    m.audioMessage ||
    m.documentMessage ||
    m.stickerMessage ||
    m.locationMessage ||
    m.liveLocationMessage ||
    m.contactMessage ||
    m.contactsArrayMessage ||
    m.pollCreationMessage ||
    m.buttonsMessage ||
    m.listMessage ||
    m.interactiveMessage
  )
}

function isProtocolOnly(protoMsg) {
  return !hasRenderableContent(protoMsg.message)
}

// Unwrap an edit-update payload into plain message content
function unwrapEditContent(updateMessage) {
  if (!updateMessage) return null
  const inner = updateMessage.editedMessage?.message || updateMessage
  return { message: inner }
}

function typeLabel(t) {
  const map = { image: '📷 Photo', video: '🎬 Video', voice: '🎤 Voice note', doc: '📄 Document', sticker: '⭐ Sticker', location: '📍 Location', contact: '👤 Contact' }
  return map[t] || ''
}

function extractText(protoMsg) {
  const m = protoMsg.message
  if (!m) return ''
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ''
  )
}

function detectType(protoMsg) {
  const m = protoMsg.message
  if (!m) return 'text'
  if (m.imageMessage) return 'image'
  if (m.videoMessage) return 'video'
  if (m.audioMessage) return 'voice'
  if (m.documentMessage) return 'doc'
  if (m.stickerMessage) return 'sticker'
  if (m.locationMessage || m.liveLocationMessage) return 'location'
  if (m.contactMessage || m.contactsArrayMessage) return 'contact'
  return 'text'
}

function thumbOf(protoMsg) {
  const m = protoMsg.message
  const t = m?.imageMessage?.jpegThumbnail || m?.videoMessage?.jpegThumbnail || m?.stickerMessage?.jpegThumbnail
  if (!t || !Buffer.isBuffer(t)) return null
  return `data:image/jpeg;base64,${t.toString('base64')}`
}

// WebMessageInfoStatus: ERROR=0 PENDING=1 SERVER_ACK=2 DELIVERY_ACK=3 READ=4 PLAYED=5
function mapStatus(n) {
  if (n >= 4) return 'read'
  if (n === 3) return 'delivered'
  return 'sent'
}

function normalizeMsg(protoMsg, resolved) {
  const key = protoMsg.key || {}
  const chatId = resolved.chatId
  const fromMe = !!key.fromMe
  const type = detectType(protoMsg)
  return {
    id: key.id || `${now()}-${Math.random().toString(36).slice(2)}`,
    chatId,
    fromMe,
    senderName: fromMe ? undefined : resolved.senderName,
    senderJid: fromMe ? undefined : resolved.senderJid,
    body: extractText(protoMsg),
    type,
    ts: Number(protoMsg.messageTimestamp) * 1000 || now(),
    status: fromMe ? mapStatus(protoMsg.status) : 'read',
    thumb: thumbOf(protoMsg),
    hasMedia: type !== 'text',
    deleted: false,
  }
}

function displayNameFor(id, chats, contacts) {
  const c = chats.get(id) || {}
  if (c.name) return c.name
  const contact = contacts.get(id)
  // Priority: phone-saved name > any synced name > profile/push name > number
  if (contact && (contact.savedName || contact.name || contact.notify)) {
    return contact.savedName || contact.name || contact.notify
  }
  if (!id) return 'Unknown'
  if (id.endsWith('@g.us')) return 'Group'
  return prettyPhone(id)
}

function lastMsgLabel(m) {
  if (!m) return ''
  if (m.deleted) return '🚫 This message was deleted'
  if (m.body) return m.body
  return typeLabel(m.type)
}

function toChat(id, chats, contacts, messages) {
  const c = chats.get(id) || {}
  const msgs = messages.get(id) || []
  const last = msgs[msgs.length - 1]
  const contact = contacts.get(id) || {}
  return {
    id,
    name: displayNameFor(id, chats, contacts),
    pic: contact.pic || null,
    isGroup: id.endsWith('@g.us'),
    lastMsg: last ? lastMsgLabel(last) : c.lastMsg || '',
    ts: last ? last.ts : (c.conversationTimestamp || c.lastMessageRecvTimestamp || 0) * 1000,
    unread: c.unreadCount || 0,
    muted: !!c.muted || (c.muteEndTime || 0) * 1000 > now(),
    pinned: !!c.pinned || (c.pinInChat || 0) > 0,
    archived: !!c.archived,
  }
}

function createWaService({ authDir, cacheDir, emit }) {
  let B = null // baileys module (ESM, dynamic import)
  let QRCode = null
  let pinoMod = null
  let sock = null
  let connection = 'connecting'
  let lastQr = null
  let lastQrDataUrl = null
  let reconnectAttempt = 0
  let stopped = false
  let saveCredsFn = null
  let resyncTimer = null

  const chats = new Map() // jid -> raw chat attrs
  const contacts = new Map() // jid -> {name, notify, pic, picTs}
  const messages = new Map() // jid -> normalized Msg[]
  const rawById = new Map() // msgId -> proto (for quote/edit context), capped
  const rawOrder = []
  const lidCache = new Map() // @lid jid -> resolved @s.whatsapp.net jid
  const senderNames = new Map() // participant jid -> display name (from pushName)
  let showArchived = false
  let metaRefreshTimer = null

  const snapshotPath = path.join(cacheDir, 'snapshot.json')

  function rememberRaw(id, proto) {
    rawById.set(id, proto)
    rawOrder.push(id)
    if (rawOrder.length > MSG_CAP * 4) {
      const old = rawOrder.splice(0, rawOrder.length - MSG_CAP * 4)
      for (const k of old) rawById.delete(k)
    }
  }

  function pushMessages(chatId, list, { notify = false } = {}) {
    let arr = messages.get(chatId)
    if (!arr) {
      arr = []
      messages.set(chatId, arr)
    }
    const seen = new Set(arr.map((m) => m.id))
    const fresh = []
    for (const m of list) {
      if (!m.id || seen.has(m.id)) continue
      seen.add(m.id)
      arr.push(m)
      fresh.push(m)
    }
    if (arr.length > MSG_CAP) arr.splice(0, arr.length - MSG_CAP)
    const c = chats.get(chatId) || {}
    chats.set(chatId, { ...c, id: chatId, conversationTimestamp: Math.floor(now() / 1000) })
    if (notify) {
      const cur = chats.get(chatId)
      chats.set(chatId, { ...cur, unreadCount: (cur.unreadCount || 0) + fresh.filter((m) => !m.fromMe).length })
    }
    scheduleSnapshot()
    return fresh
  }

  let snapshotTimer = null
  function scheduleSnapshot() {
    if (snapshotTimer) return
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null
      try {
        fs.mkdirSync(cacheDir, { recursive: true })
        const snap = {
          chats: [...chats.entries()].slice(-200),
          messages: [...messages.entries()].map(([id, arr]) => [id, arr.slice(-SNAPSHOT_MSGS)]),
          contacts: [...contacts.entries()].slice(-500),
          lid: [...lidCache.entries()].slice(-500),
        }
        fs.writeFileSync(snapshotPath, JSON.stringify(snap))
      } catch {
        // non-fatal
      }
    }, 5000)
  }

  function loadSnapshot() {
    try {
      if (!fs.existsSync(snapshotPath)) return
      const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
      for (const [k, v] of snap.chats || []) chats.set(k, v)
      for (const [k, v] of snap.messages || []) messages.set(k, v)
      for (const [k, v] of snap.contacts || []) contacts.set(k, v)
      for (const [k, v] of snap.lid || []) lidCache.set(k, v)
    } catch {
      // corrupt snapshot — start fresh
    }
  }

  function publicChats() {
    return [...chats.keys()]
      .filter((id) => !isJunkChat(id))
      .map((id) => toChat(id, chats, contacts, messages))
      .filter((c) => (showArchived ? true : !c.archived))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.ts - a.ts)
  }

  function archivedCount() {
    let n = 0
    for (const id of chats.keys()) {
      if (!isJunkChat(id) && (chats.get(id) || {}).archived) n += 1
    }
    return n
  }

  // Re-key a single @lid chat to its PN (merges duplicates). Returns true if moved.
  function rekeyChat(lid, pn) {
    if (!lid || !pn || lid === pn || !chats.has(lid)) return false
    lidCache.set(lid, pn)
    const prev = chats.get(lid) || {}
    const target = chats.get(pn) || {}
    const prevTs = prev.conversationTimestamp || prev.lastMessageRecvTimestamp || 0
    const targetTs = target.conversationTimestamp || target.lastMessageRecvTimestamp || 0
    chats.set(pn, { ...(prevTs > targetTs ? prev : target), ...(prevTs > targetTs ? target : prev), id: pn })
    chats.delete(lid)
    // Merge contact records (saved names live under the PN)
    const lc = contacts.get(lid) || {}
    const tc = contacts.get(pn) || {}
    contacts.set(pn, {
      ...lc,
      ...tc,
      name: tc.name || lc.name,
      notify: tc.notify || lc.notify,
      savedName: tc.savedName || lc.savedName,
      pic: tc.pic || lc.pic,
      picTs: tc.picTs || lc.picTs,
    })
    contacts.delete(lid)
    if (messages.has(lid)) {
      const merged = [...(messages.get(pn) || []), ...messages.get(lid)]
      const seen = new Set()
      messages.set(
        pn,
        merged.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), (m.chatId = pn), true))).sort((a, b) => a.ts - b.ts),
      )
      messages.delete(lid)
    }
    return true
  }

  // Resolve @lid addresses to phone-number JIDs (cached). Falls back to input.
  async function normalizeJid(jid) {
    if (!jid || !jid.endsWith('@lid')) return jid
    const hit = lidCache.get(jid)
    if (hit) return hit
    try {
      const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(jid)
      if (pn) {
        lidCache.set(jid, pn)
        return pn
      }
    } catch {
      // mapping unavailable — show raw
    }
    return jid
  }

  // Resolve a sender for display: participantAlt (PN) > participant > pushName cache
  async function resolveSender(key, pushName) {
    const participant = key.participant
    const alt = key.participantAlt
    let senderJid = alt || participant || null
    if (senderJid && senderJid.endsWith('@lid')) senderJid = await normalizeJid(senderJid)
    let senderName
    if (senderJid) {
      const known = senderNames.get(senderJid) || contacts.get(senderJid)
      senderName = (known && (known.name || known.notify)) || undefined
    }
    if (pushName) {
      if (!senderName) senderName = pushName
      // Learn names from traffic: participant JID + chat-level notify
      if (senderJid) {
        const prev = senderNames.get(senderJid)
        if (!prev || (prev !== pushName && !contacts.get(senderJid)?.name)) senderNames.set(senderJid, pushName)
      }
    }
    return { senderJid, senderName }
  }

  // Fire-and-forget enrichment: group subjects + profile pictures (debounced, capped)
  function scheduleMetaRefresh() {
    if (metaRefreshTimer) return
    metaRefreshTimer = setTimeout(() => {
      metaRefreshTimer = null
      void refreshMeta()
    }, 2500)
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ])
  }

  async function refreshMeta() {
    if (!sock || stopped) return
    // Re-key chats stuck on @lid (parallel, bounded) once mappings are learnable
    const stuck = [...chats.keys()].filter((id) => id.endsWith('@lid') && !lidCache.has(id)).slice(0, 60)
    if (stuck.length > 0) {
      const results = await Promise.allSettled(
        stuck.map((id) =>
          withTimeout(sock.signalRepository?.lidMapping?.getPNForLID(id), 8000).then((pn) => ({ id, pn })),
        ),
      )
      let moved = 0
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.pn && r.value.pn !== r.value.id) {
          if (rekeyChat(r.value.id, r.value.pn)) moved += 1
        }
      }
      if (moved > 0) {
        console.log(`[chattt:wa] re-keyed ${moved} LID chats to phone numbers`)
        emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
      }
    }
    const ids = [...chats.keys()].filter((id) => !isJunkChat(id))
    ids.sort((a, b) => {
      const ta = (chats.get(a) || {}).conversationTimestamp || 0
      const tb = (chats.get(b) || {}).conversationTimestamp || 0
      return tb - ta
    })
    let groupsFixed = 0
    let picsFixed = 0
    // Group subjects (server is source of truth), 6 at a time — one hung query stalls nothing
    const needMeta = ids.filter((id) => id.endsWith('@g.us') && !(chats.get(id) || {}).name).slice(0, 60)
    for (let i = 0; i < needMeta.length; i += 6) {
      const batch = needMeta.slice(i, i + 6)
      const results = await Promise.allSettled(
        batch.map((id) => withTimeout(sock.groupMetadata(id), 12000).then((meta) => ({ id, meta }))),
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.meta?.subject) {
          chats.set(r.value.id, { ...(chats.get(r.value.id) || {}), name: r.value.meta.subject })
          groupsFixed += 1
        }
      }
      if (stopped) return
    }
    // Profile pictures (preview), most-recent chats first, 8 at a time
    const nowMs = now()
    const needPic = ids
      .filter((id) => {
        const c = contacts.get(id) || {}
        return !(c.pic && nowMs - (c.picTs || 0) < 24 * 3600 * 1000)
      })
      .slice(0, 80)
    for (let i = 0; i < needPic.length; i += 8) {
      const batch = needPic.slice(i, i + 8)
      const results = await Promise.allSettled(
        batch.map((id) => withTimeout(sock.profilePictureUrl(id, 'preview'), 12000).then((url) => ({ id, url }))),
      )
      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        const c = contacts.get(r.value.id) || {}
        contacts.set(r.value.id, { ...c, pic: r.value.url || null, picTs: nowMs })
        if (r.value.url) picsFixed += 1
      }
      if (stopped) return
    }
    console.log(`[chattt:wa] meta refresh: +${groupsFixed} group names, +${picsFixed} pictures`)
    let savedNames = 0
    for (const c of contacts.values()) {
      if (c.savedName) savedNames += 1
    }
    console.log(`[chattt:wa] address book: ${savedNames} phone-saved names known`)
    emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
    scheduleSnapshot()
  }

  function stopResync() {
    if (resyncTimer) {
      clearInterval(resyncTimer)
      resyncTimer = null
    }
  }

  // Pull app-state collections (address book, read/archive/pin states).
  // Companions only learn saved contact names + remote read states through these.
  async function resyncAppState() {
    if (!sock || stopped || connection === 'logged-out') return
    try {
      const names = B.ALL_WA_PATCH_NAMES || ['critical_block', 'critical_unblock_low', 'regular_high', 'regular_low', 'regular']
      await sock.resyncAppState(names, false)
      console.log('[chattt:wa] app-state resync done')
    } catch (e) {
      console.log('[chattt:wa] app-state resync failed:', e?.message || e)
    }
  }

  function startResyncLoop() {
    stopResync()
    void resyncAppState()
    resyncTimer = setInterval(() => {
      void resyncAppState()
    }, 60000)
  }

  function setConnection(state, extra) {
    connection = state
    console.log(`[chattt:wa] connection → ${state}`)
    emit({ kind: 'connection', state, ...(extra || {}) })
  }

  async function ensureModules() {
    if (!B) {
      B = await import('baileys')
      QRCode = (await import('qrcode')).default || (await import('qrcode'))
      pinoMod = (await import('pino')).default
    }
  }

  async function start() {
    stopped = false
    loadSnapshot()
    if (chats.size > 0) emit({ kind: 'chats', chats: publicChats() })
    await connect()
  }

  function stop() {
    stopped = true
    stopResync()
    try {
      sock?.end()
    } catch {
      // ignore
    }
    sock = null
  }

  async function connect() {
    if (stopped) return
    await ensureModules()
    const makeWASocket = B.default
    const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = B
    fs.mkdirSync(authDir, { recursive: true })

    setConnection('connecting')
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    saveCredsFn = saveCreds
    let version
    try {
      ;({ version } = await fetchLatestBaileysVersion())
    } catch {
      version = [2, 3000, 1043857760]
    }

    sock = makeWASocket({
      version,
      auth: state,
      logger: pinoMod({ level: 'silent' }),
      browser: ['chattt', 'Desktop', '1.0'],
      markOnlineOnConnect: true,
      syncFullHistory: true,
    })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (u) => {
      const { connection: conn, lastDisconnect, qr } = u
      if (qr) {
        lastQr = qr
        try {
          lastQrDataUrl = await QRCode.toDataURL(qr, { width: 232, margin: 1 })
        } catch {
          lastQrDataUrl = null
        }
        console.log('[chattt:wa] QR generated — scan to link')
        setConnection('qr')
        emit({ kind: 'qr', dataUrl: lastQrDataUrl })
        return
      }
      if (conn === 'open') {
        reconnectAttempt = 0
        lastQr = null
        lastQrDataUrl = null
        setConnection('syncing')
        // Pull address book + read/archive states, then keep them fresh.
        // History sync alone does NOT deliver phone-saved contact names on warm restarts.
        startResyncLoop()
        scheduleMetaRefresh()
        // history.set flips us to ready; fallback timer in case it never arrives
        setTimeout(() => {
          if (connection === 'syncing') {
            setConnection('ready')
            emit({ kind: 'chats', chats: publicChats() })
          }
        }, 8000)
        return
      }
      if (conn === 'close') {
        stopResync()
        const code = lastDisconnect?.error?.output?.statusCode
        if (code === DisconnectReason.loggedOut || code === 405) {
          try {
            fs.rmSync(authDir, { recursive: true, force: true })
          } catch {
            // ignore
          }
          setConnection('logged-out')
          setTimeout(() => {
            if (!stopped) void connect()
          }, 1500)
          return
        }
        setConnection('offline')
        if (!stopped) {
          reconnectAttempt += 1
          const delay = Math.min(2 ** reconnectAttempt * 1000, 30000)
          setTimeout(() => {
            if (!stopped) void connect()
          }, delay)
        }
      }
    })

    sock.ev.on('messaging-history.set', async ({ chats: hc, contacts: cc, messages: hm }) => {
      for (const c of hc || []) {
        if (!c.id || isJunkChat(c.id)) continue
        const id = await normalizeJid(c.id)
        const prev = chats.get(id) || {}
        // Merge duplicates (LID + PN copies of the same chat): keep newest meta
        const prevTs = prev.conversationTimestamp || prev.lastMessageRecvTimestamp || 0
        const nextTs = c.conversationTimestamp || c.lastMessageRecvTimestamp || 0
        chats.set(id, nextTs >= prevTs ? { ...prev, ...c, id } : { ...c, ...prev, id })
      }
      for (const c of cc || []) {
        if (!c.id) continue
        const id = await normalizeJid(c.id)
        const prev = contacts.get(id) || {}
        contacts.set(id, { ...prev, name: c.name || prev.name, notify: c.notify || prev.notify })
      }
      for (const m of hm || []) {
        if (!m.key?.remoteJid || isJunkChat(m.key.remoteJid) || isProtocolOnly(m)) continue
        const chatId = await normalizeJid(m.key.remoteJid)
        rememberRaw(m.key.id, m)
        const { senderJid, senderName } = await resolveSender(m.key, m.pushName)
        pushMessages(chatId, [normalizeMsg(m, { chatId, senderJid, senderName })])
      }
      // Learn DM names from message notify headers where contacts lack them
      for (const [chatId, arr] of messages) {
        if (chatId.endsWith('@g.us')) continue
        const contact = contacts.get(chatId) || {}
        if (!contact.name && !contact.notify) {
          const named = arr.find((x) => x.senderName)
          if (named) contacts.set(chatId, { ...contact, notify: named.senderName })
        }
      }
      setConnection('ready')
      const totalMsgs = [...messages.values()].reduce((a, m) => a + m.length, 0)
      console.log(`[chattt:wa] synced ${chats.size} chats, ${totalMsgs} messages`)
      // Shape diagnostics (counts only, no PII): do synced contacts carry names?
      let withName = 0
      let withNotify = 0
      let withSaved = 0
      for (const c of contacts.values()) {
        if (c.name) withName += 1
        if (c.notify) withNotify += 1
        if (c.savedName) withSaved += 1
      }
      console.log(`[chattt:wa] contacts: ${contacts.size} total, ${withName} name, ${withNotify} notify, ${withSaved} phone-saved`)
      emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
      for (const [chatId, arr] of messages) {
        if (arr.length > 0 && !isJunkChat(chatId)) emit({ kind: 'messages', chatId, messages: arr.slice(-50), reset: true })
      }
      scheduleMetaRefresh()
    })

    sock.ev.on('chats.upsert', async (list) => {
      for (const c of list) {
        if (!c.id || isJunkChat(c.id)) continue
        const id = await normalizeJid(c.id)
        chats.set(id, { ...(chats.get(id) || {}), ...c, id })
      }
      emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
      scheduleSnapshot()
      scheduleMetaRefresh()
    })
    sock.ev.on('chats.update', async (list) => {
      for (const c of list) {
        if (!c.id) continue
        const id = await normalizeJid(c.id)
        if (isJunkChat(id)) continue
        const { conditional, ...rest } = c
        // -1 = "recount/unknown" from mark-as-unread actions — never show negative
        if (rest.unreadCount === -1) rest.unreadCount = 0
        chats.set(id, { ...(chats.get(id) || {}), ...rest, id })
      }
      emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
      scheduleSnapshot()
    })

    sock.ev.on('contacts.upsert', async (list) => {
      let changed = false
      for (const c of list) {
        if (!c.id) continue
        const id = await normalizeJid(c.id)
        const prev = contacts.get(id) || {}
        const next = { ...prev }
        // contactAction / lidContactAction patches carry the PHONE-saved name.
        // (Patch signal = truthy lid/phoneNumber/username — history contacts lack these.)
        if (c.lid || c.phoneNumber || c.username) {
          if (c.name && c.name !== next.savedName) {
            next.savedName = c.name
            changed = true
          }
          // Learn the LID↔PN pairing straight from the patch
          const lid = c.lid && String(c.lid).endsWith('@lid') ? c.lid : null
          const pn = c.phoneNumber || (String(c.id).endsWith('@s.whatsapp.net') ? c.id : null)
          if (lid && pn && !lidCache.has(lid)) {
            lidCache.set(lid, pn)
            if (rekeyChat(lid, pn)) changed = true
          }
        } else {
          if (c.name && c.name !== next.name) {
            next.name = c.name
            changed = true
          }
          if (c.notify && c.notify !== next.notify) {
            next.notify = c.notify
            changed = true
          }
        }
        contacts.set(id, next)
      }
      if (changed) {
        emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
        scheduleSnapshot()
      }
    })

    // Phone address-book sync also emits direct LID↔PN pairings — adopt + rekey at once
    sock.ev.on('lid-mapping.update', ({ lid, pn }) => {
      try {
        if (!lid || !pn) return
        if (!lidCache.has(lid)) lidCache.set(lid, pn)
        if (rekeyChat(lid, pn)) {
          emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
          scheduleSnapshot()
        }
      } catch {
        // ignore
      }
    })

    sock.ev.on('messages.upsert', async ({ messages: list, type }) => {
      const isLive = type === 'notify'
      const byChat = new Map()
      for (const m of list || []) {
        if (!m.key?.remoteJid || isJunkChat(m.key.remoteJid) || isProtocolOnly(m)) continue
        const chatId = await normalizeJid(m.key.remoteJid)
        rememberRaw(m.key.id, m)
        const { senderJid, senderName } = await resolveSender(m.key, m.pushName)
        const n = normalizeMsg(m, { chatId, senderJid, senderName })
        // Learn DM names from live traffic
        if (!chatId.endsWith('@g.us') && !n.fromMe && m.pushName) {
          const prev = contacts.get(chatId) || {}
          if (!prev.name && !prev.notify) contacts.set(chatId, { ...prev, notify: m.pushName })
        }
        if (!byChat.has(chatId)) byChat.set(chatId, [])
        byChat.get(chatId).push(n)
      }
      for (const [chatId, arr] of byChat) {
        const fresh = pushMessages(chatId, arr, { notify: isLive })
        if (fresh.length > 0) {
          emit({ kind: 'messages', chatId, messages: fresh, reset: false })
          emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
          for (const m of fresh) {
            if (isLive && !m.fromMe) {
              const chat = toChat(chatId, chats, contacts, messages)
              if (!chat.muted) emit({ kind: 'notify', chatId, title: chat.name, body: m.body || typeLabel(m.type) })
            }
          }
        }
      }
    })

    sock.ev.on('messages.update', (list) => {
      const changed = []
      for (const u of list || []) {
        const id = u.key?.id
        const rawChatId = u.key?.remoteJid
        if (!id || !rawChatId) continue
        // Updates may reference the LID copy — check both forms
        const candidates = [rawChatId]
        if (rawChatId.endsWith('@lid')) {
          const mapped = lidCache.get(rawChatId)
          if (mapped) candidates.push(mapped)
        } else {
          for (const [lid, pn] of lidCache) {
            if (pn === rawChatId) {
              candidates.push(lid)
              break
            }
          }
        }
        let m = null
        let chatId = null
        for (const cid of candidates) {
          const found = (messages.get(cid) || []).find((x) => x.id === id)
          if (found) {
            m = found
            chatId = cid
            break
          }
        }
        if (!m || !chatId) continue
        const upd = u.update || {}
        if (typeof upd.status === 'number') m.status = mapStatus(upd.status)
        // Remote delete (REVOKE comes through as message:null / stub REVOKE)
        if (upd.message === null || upd.messageStubType === 2 || upd.messageStubType === 'REVOKE') {
          m.body = ''
          m.type = 'text'
          m.deleted = true
          m.reaction = null
        }
        // Remote edit (MESSAGE_EDIT carries editedMessage content)
        const edited = upd.message?.editedMessage?.message
        if (edited) {
          const text = extractText({ message: edited })
          const dtype = detectType({ message: edited })
          if (text || dtype !== 'text') {
            m.body = text
            if (dtype !== 'text') m.type = dtype
            m.edited = true
            m.deleted = false
          }
        } else if (upd.message && (upd.message.conversation || upd.message.extendedTextMessage)) {
          // Full replacement payload — apply defensively
          const text = extractText({ message: upd.message })
          if (text) {
            m.body = text
            m.edited = true
          }
        }
        changed.push({ chatId, message: m })
      }
      for (const c of changed) emit({ kind: 'message-update', ...c })
      if (changed.length > 0) {
        emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
        scheduleSnapshot()
      }
    })

    sock.ev.on('messages.reaction', (list) => {
      for (const r of list || []) {
        const id = r.key?.id
        const chatId = r.key?.remoteJid
        if (!id || !chatId) continue
        const arr = messages.get(chatId)
        const m = arr?.find((x) => x.id === id)
        if (!m) continue
        m.reaction = r.reaction?.text || null
        emit({ kind: 'message-update', chatId, message: m })
      }
    })

    // "Delete for me" on another device — remove locally (not a REVOKE, no stub type)
    sock.ev.on('messages.delete', (payload) => {
      const keys = payload?.keys || []
      let changed = false
      for (const k of keys) {
        const id = k?.id
        const chatId = k?.remoteJid
        if (!id || !chatId) continue
        const arr = messages.get(chatId)
        const idx = arr ? arr.findIndex((x) => x.id === id) : -1
        if (idx < 0 || !arr) continue
        arr.splice(idx, 1)
        changed = true
        emit({ kind: 'message-deleted', chatId, msgId: id })
      }
      if (changed) {
        emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
        scheduleSnapshot()
      }
    })

    sock.ev.on('presence.update', ({ id, presences }) => {
      for (const [participant, p] of Object.entries(presences || {})) {
        const state = p.lastKnownPresence
        if (!state) continue
        emit({ kind: 'presence', chatId: id, from: participant, state })
      }
    })
  }

  // ---------- actions (called from IPC) ----------

  function requireSock() {
    if (!sock || connection === 'logged-out' || connection === 'offline') {
      throw new Error(connection === 'logged-out' ? 'logged-out' : 'not-connected')
    }
    return sock
  }

  async function sendText(chatId, body, replyToId) {
    const s = requireSock()
    const target = await normalizeJid(chatId)
    let quoted
    if (replyToId) {
      const raw = rawById.get(replyToId)
      if (raw) quoted = raw
    }
    const sent = await s.sendMessage(target, { text: body }, quoted ? { quoted } : undefined)
    const n = normalizeMsg(sent, { chatId: target, senderJid: null, senderName: undefined })
    rememberRaw(n.id, sent)
    pushMessages(target, [{ ...n, fromMe: true, status: 'sent' }])
    emit({ kind: 'messages', chatId: target, messages: messages.get(target).slice(-1), reset: false })
    emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
    return { ok: true, id: n.id }
  }

  async function react(chatId, msgId, emoji) {
    const s = requireSock()
    const raw = rawById.get(msgId)
    if (!raw) throw new Error('message-not-found')
    await s.sendMessage(chatId, { react: { text: emoji || '', key: raw.key } })
    return { ok: true }
  }

  async function editMessage(chatId, msgId, body) {
    const s = requireSock()
    const target = await normalizeJid(chatId)
    const raw = rawById.get(msgId)
    if (!raw) throw new Error('message-not-found')
    await s.sendMessage(target, { text: body, edit: raw.key })
    // Optimistic local apply (the MESSAGE_EDIT echo arrives separately too)
    const m = (messages.get(target) || []).find((x) => x.id === msgId)
    if (m) {
      m.body = body
      m.edited = true
      emit({ kind: 'message-update', chatId: target, message: m })
      emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
      scheduleSnapshot()
    }
    return { ok: true }
  }

  async function deleteMessage(chatId, msgId) {
    const s = requireSock()
    const target = await normalizeJid(chatId)
    const raw = rawById.get(msgId)
    if (!raw) throw new Error('message-not-found')
    await s.sendMessage(target, { delete: raw.key })
    const m = (messages.get(target) || []).find((x) => x.id === msgId)
    if (m) {
      m.body = ''
      m.type = 'text'
      m.deleted = true
      m.reaction = null
      emit({ kind: 'message-update', chatId: target, message: m })
      emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
      scheduleSnapshot()
    }
    return { ok: true }
  }

  async function markRead(chatId) {
    const target = (await normalizeJid(chatId)) || chatId
    const c = chats.get(target)
    if (c) {
      chats.set(target, { ...c, unreadCount: 0 })
      emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
    }
    try {
      const s = requireSock()
      const arr = messages.get(chatId) || []
      const keys = arr
        .filter((m) => !m.fromMe)
        .slice(-20)
        .map((m) => rawById.get(m.id)?.key)
        .filter(Boolean)
      if (keys.length > 0) await s.readMessages(keys)
    } catch {
      // offline — local state already updated
    }
    scheduleSnapshot()
    return { ok: true }
  }

  async function requestPairingCode(phone) {
    const s = sock
    if (!s) throw new Error('not-connected')
    const clean = String(phone || '').replace(/\D/g, '')
    if (clean.length < 7) throw new Error('invalid-phone')
    try {
      const code = await s.requestPairingCode(clean)
      return { ok: true, code }
    } catch (e) {
      throw new Error(e?.message || 'pairing-failed')
    }
  }

  async function logout() {
    stopResync()
    try {
      await sock?.logout()
    } catch {
      // ignore
    }
    try {
      fs.rmSync(authDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
    chats.clear()
    messages.clear()
    rawById.clear()
    rawOrder.length = 0
    lidCache.clear()
    senderNames.clear()
    try {
      fs.rmSync(snapshotPath, { force: true })
    } catch {
      // ignore
    }
    emit({ kind: 'chats', chats: [] })
    setConnection('logged-out')
    setTimeout(() => {
      if (!stopped) void connect()
    }, 1000)
    return { ok: true }
  }

  async function groupInfo(chatId) {
    const s = requireSock()
    const meta = await s.groupMetadata(chatId)
    return {
      ok: true,
      group: {
        id: meta.id,
        name: meta.subject,
        desc: meta.desc || '',
        participants: (meta.participants || []).map((p) => ({ id: p.id, admin: p.admin || null })),
      },
    }
  }

  async function sendPresence(chatId, state) {
    try {
      const s = requireSock()
      if (state === 'composing' || state === 'paused') {
        await s.sendPresenceUpdate(state, chatId)
      }
    } catch {
      // ignore
    }
    return { ok: true }
  }

  async function pickAndSend(chatId, filePath) {
    const s = requireSock()
    const target = await normalizeJid(chatId)
    const data = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const images = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    const videos = ['.mp4', '.mov', '.mkv', '.webm']
    const audio = ['.mp3', '.ogg', '.oga', '.wav', '.m4a']
    let content
    if (images.includes(ext)) content = { image: data, caption: '' }
    else if (videos.includes(ext)) content = { video: data, caption: '' }
    else if (audio.includes(ext)) content = { audio: data, mimetype: 'audio/ogg; codecs=opus' }
    else content = { document: data, fileName: path.basename(filePath) }
    const sent = await s.sendMessage(target, content)
    const n = normalizeMsg(sent, { chatId: target, senderJid: null, senderName: undefined })
    rememberRaw(n.id, sent)
    pushMessages(target, [{ ...n, fromMe: true, status: 'sent' }])
    emit({ kind: 'messages', chatId: target, messages: messages.get(target).slice(-1), reset: false })
    emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
    return { ok: true, id: n.id }
  }

  async function getMedia(msgId) {
    await ensureModules()
    const raw = rawById.get(msgId)
    if (!raw) throw new Error('message-not-found')
    const buf = await B.downloadMediaMessage(raw, 'buffer', {})
    if (!buf || buf.length > 12 * 1024 * 1024) throw new Error('media-too-large')
    const m = raw.message || {}
    const mime =
      m.imageMessage?.mimetype || m.videoMessage?.mimetype || m.audioMessage?.mimetype || m.documentMessage?.mimetype || 'application/octet-stream'
    return { ok: true, mime, data: buf.toString('base64') }
  }

  function hasSession() {
    try {
      return fs.existsSync(path.join(authDir, 'creds.json'))
    } catch {
      return false
    }
  }

  // Force re-fetch a chat picture (used when a cached URL 403s at render time)
  async function refreshPic(chatId) {
    const s = requireSock()
    const target = (await normalizeJid(chatId)) || chatId
    try {
      const url = await withTimeout(s.profilePictureUrl(target, 'preview'), 15000)
      const c = contacts.get(target) || {}
      contacts.set(target, { ...c, pic: url || null, picTs: now() })
      emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
      scheduleSnapshot()
      return { ok: true, pic: url || null }
    } catch (e) {
      const c = contacts.get(target) || {}
      contacts.set(target, { ...c, pic: null, picTs: now() })
      return { ok: false, error: 'no-pic' }
    }
  }

  function searchMessages(query, chatId) {
    const q = String(query || '').toLowerCase()
    if (!q) return []
    const out = []
    const chatIds = chatId ? [chatId] : [...messages.keys()]
    for (const id of chatIds) {
      for (const m of messages.get(id) || []) {
        if (m.body && m.body.toLowerCase().includes(q)) {
          out.push(m)
          if (out.length >= 50) return out
        }
      }
    }
    return out.sort((a, b) => b.ts - a.ts)
  }

  // ---------- new chat ----------

  async function resolveContact(query) {
    const s = requireSock()
    const digits = String(query || '').replace(/\D/g, '')
    if (digits.length < 7) throw new Error('invalid-phone')
    const [info] = await s.onWhatsApp(digits)
    if (!info?.exists) return { ok: true, exists: false, jid: null, name: null }
    const jid = info.jid
    const contact = contacts.get(jid) || {}
    return { ok: true, exists: true, jid, name: contact.name || contact.notify || null }
  }

  async function startChat(jid) {
    requireSock()
    const target = await normalizeJid(jid)
    if (!target || isJunkChat(target)) throw new Error('invalid-chat')
    if (!chats.has(target)) {
      chats.set(target, { id: target, conversationTimestamp: Math.floor(now() / 1000), unreadCount: 0 })
    }
    if (!messages.has(target)) messages.set(target, [])
    scheduleSnapshot()
    scheduleMetaRefresh()
    const chat = toChat(target, chats, contacts, messages)
    emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
    return { ok: true, chat }
  }

  function setShowArchived(show) {
    showArchived = !!show
    emit({ kind: 'chats', chats: publicChats(), archived: archivedCount() })
    return { ok: true, showArchived, archived: archivedCount() }
  }

  return {
    start,
    stop,
    getState: () => ({ connection, qr: lastQrDataUrl, showArchived, archived: archivedCount(), hasSession: hasSession() }),
    getChats: () => publicChats(),
    getMessages: (chatId) => (messages.get(chatId) || []).slice(-50),
    refreshPic,
    sendText,
    react,
    editMessage,
    deleteMessage,
    markRead,
    requestPairingCode,
    logout,
    groupInfo,
    sendPresence,
    pickAndSend,
    getMedia,
    searchMessages,
    resolveContact,
    startChat,
    setShowArchived,
  }
}

module.exports = { createWaService }
