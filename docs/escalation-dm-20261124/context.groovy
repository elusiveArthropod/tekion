// Builds the Finance escalation message and the full conversation for the thread reply.
def getVar = { String n -> binding.hasVariable(n) && binding.getVariable(n) != null ? binding.getVariable(n).toString().trim() : '' }
def esc = { String s -> (s ?: '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') }
def clean = { String s -> (s ?: '').replaceAll(/<@[A-Z0-9]+>/, '').replaceAll(/\$\$\[[^\]]*\]\$\$/, '').trim() }
def textOf = { c ->
  if (c == null) return ''
  if (c instanceof Map) return (c.text ?: '').toString()
  def s = c.toString()
  if (s.trim().startsWith('{')) {
    try { def m = new groovy.json.JsonSlurper().parseText(s); return (m instanceof Map ? (m.text ?: '') : s).toString() } catch (Exception e) { return s }
  }
  return s
}

def raw = binding.hasVariable('messages') && binding.getVariable('messages') instanceof List ? binding.getVariable('messages') : []
def rows = raw.collect { r -> (r instanceof Map && r.properties instanceof Map) ? r.properties : (r instanceof Map ? r : [:]) }

def lines = []
rows.each { r ->
  def t = clean(textOf(r.content))
  if (!t) return
  boolean bot = (r.type ?: '').toString() != 'fan'
  // Skip the bot's progress lines such as "Executing the tool ... to assist you."
  if (bot && t.length() < 200 && (t =~ /(?i)\btool\b/).find()) return
  if (t.length() > 1500) t = t.substring(0, 1500) + ' ...'
  lines << ((bot ? '*P2P Genie:* ' : '*User:* ') + esc(t))
}

// Keep the most recent messages within Slack's comfortable message size.
def kept = []
int total = 0
for (int i = lines.size() - 1; i >= 0; i--) {
  def l = lines[i]
  if (total + l.length() > 11000) { kept.add(0, '_(earlier messages omitted)_'); break }
  kept.add(0, l)
  total += l.length()
}

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

def transcript = kept ? ('*Conversation with P2P Genie*\n\n' + kept.join('\n\n')) : '_Conversation history is not available for this escalation._'

result = [mainText: mainText, transcript: transcript, messageCount: lines.size()]
