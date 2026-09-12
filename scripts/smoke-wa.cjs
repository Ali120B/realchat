// Smoke test for the WhatsApp service boot path (no phone needed).
// Seeds a snapshot so publicChats->toChat runs, then starts the socket far
// enough to prove the module has no runtime ReferenceErrors before live traffic.
// Usage: npm run smoke:wa
const fs = require('node:fs')
const { createWaService } = require('../electron/wa-service.cjs')

const base = '/tmp/chattt-smoke'
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(`${base}/cache`, { recursive: true })
fs.writeFileSync(
  `${base}/cache/snapshot.json`,
  JSON.stringify({
    chats: [
      [
        '1234567890@s.whatsapp.net',
        { id: '1234567890@s.whatsapp.net', conversationTimestamp: Math.floor(Date.now() / 1000), unreadCount: 3 },
      ],
    ],
    messages: [
      [
        '1234567890@s.whatsapp.net',
        [{ id: 'm1', chatId: '1234567890@s.whatsapp.net', fromMe: false, body: 'hi', type: 'text', ts: Date.now(), status: 'read' }],
      ],
    ],
    contacts: [['1234567890@s.whatsapp.net', { notify: 'Smoke Test' }]],
    lid: [],
  }),
)

let sawChats = false
const wa = createWaService({
  authDir: `${base}/auth`,
  cacheDir: `${base}/cache`,
  emit: (p) => {
    if (p.kind === 'chats') {
      sawChats = true
      console.log('[smoke] chats emit OK:', JSON.stringify(p.chats))
    }
  },
})

wa.start()
  .then(() => console.log('[smoke] start OK'))
  .catch((e) => {
    console.error('[smoke] START FAIL:', e?.message || e)
    process.exit(1)
  })

setTimeout(() => {
  wa.stop()
  if (!sawChats) {
    console.error('[smoke] FAIL: no chats emit seen')
    process.exit(1)
  }
  console.log('[smoke] PASS')
  process.exit(0)
}, 20000)
