// Builds the Finance escalation message and the conversation as a list of Slack thread replies
// (one per user question / agent answer, long answers split with code blocks kept intact).
def getVar = { String n -> binding.hasVariable(n) && binding.getVariable(n) != null ? binding.getVariable(n).toString().trim() : '' }
def esc = { String s -> (s ?: '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') }
def clean = { String s ->
  (s ?: '').replaceAll(/<@[A-Z0-9]+>/, '')
           .replaceAll(/\$\$\[[^\]]*\]\$\$/, '')
           .replaceAll(/\*\*([^*\n]+)\*\*/, '*$1*')   // Markdown bold -> Slack bold
           .trim()
}
def textOf = { c ->
  if (c == null) return ''
  if (c instanceof Map) return (c.text ?: '').toString()
  def s = c.toString()
  if (s.trim().startsWith('{')) {
    try { def m = new groovy.json.JsonSlurper().parseText(s); return (m instanceof Map ? (m.text ?: '') : s).toString() } catch (Exception e) { return s }
  }
  return s
}
def isInternal = { Map r ->
  def a = r.additional
  if (a instanceof String) { try { a = new groovy.json.JsonSlurper().parseText(a) } catch (Exception e) { a = [:] } }
  if (!(a instanceof Map)) a = [:]
  a.temporaryMessage == true || a.temporaryMessage == 'true' || (a.internalMessageType in ['THOUGHT', 'AGENT_INTERNAL_RESPONSE'])
}

int LIMIT = 3800
// Split one message into pieces of at most LIMIT characters, at line breaks,
// closing an open ``` block at the end of a piece and reopening it in the next.
def splitText = { String text ->
  def pieces = []
  def cur = new StringBuilder()
  boolean inCode = false
  text.split('\n', -1).each { String line ->
    def ln = line.length() > LIMIT - 10 ? line.substring(0, LIMIT - 10) : line
    if (cur.length() + ln.length() + 5 > LIMIT) {
      if (inCode) cur.append('\n```')
      pieces << cur.toString()
      cur = new StringBuilder(inCode ? '```\n' : '')
    } else if (cur.length() > 0) {
      cur.append('\n')
    }
    cur.append(ln)
    if ((ln =~ /```/).count % 2 == 1) inCode = !inCode
  }
  if (inCode) cur.append('\n```')
  if (cur.toString().trim()) pieces << cur.toString()
  pieces
}

def raw = binding.hasVariable('messages') && binding.getVariable('messages') instanceof List ? binding.getVariable('messages') : []
def rows = raw.collect { r -> (r instanceof Map && r.properties instanceof Map) ? r.properties : (r instanceof Map ? r : [:]) }

def chunks = []
int kept = 0
rows.each { r ->
  if (isInternal(r)) return
  def t = clean(textOf(r.content))
  if (!t) return
  boolean bot = (r.type ?: '').toString() != 'fan'
  kept++
  def label = bot ? '*P2P Genie:*\n' : '*User:* '
  def parts = splitText(esc(t))
  parts.eachWithIndex { p, i -> chunks << ((i == 0 ? label : (bot ? '*P2P Genie (cont.):*\n' : '*User (cont.):* ')) + p) }
}
if (chunks.size() > 40) {
  chunks = ['_(' + (chunks.size() - 39) + ' earlier replies omitted)_'] + chunks.subList(chunks.size() - 39, chunks.size())
}
if (!chunks) chunks = ['_Conversation history is not available for this escalation._']
chunks[0] = '*Conversation with P2P Genie*\n\n' + chunks[0]

def uid = getVar('slackUserId')
def name = getVar('askerName')
def email = getVar('askerEmail')
def by = getVar('escalatedBy')
def q = esc(clean(getVar('userQuery')))
if (q.length() > 800) q = q.substring(0, 800) + ' ...'
def who = (uid ? '<@' + uid + '>' : '') + ((name || email) ? ' (' + [name, email].findAll { it }.join(', ') + ')' : '')
def mainText = ':interrobang: *Escalated from P2P Genie*\n' +
  '*Raised by:* ' + (who ?: 'Unknown user') + '\n' +
  (by && by != uid ? '*Escalated by:* <@' + by + '>\n' : '') +
  '*Question:* ' + (q ?: '_not recorded_') + '\n\n' +
  '<@U08N4N85J6P> <@U0AG6TNMF3N> please review. The full conversation is in the thread below. ' +
  'The user asked in a direct message with P2P Genie, so please reply to them directly.'

result = [mainText: mainText, chunks: chunks, chunkCount: chunks.size(), messageCount: kept]
