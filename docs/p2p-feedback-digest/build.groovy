import java.time.*
import java.time.format.DateTimeFormatter

def zone = ZoneId.of('Asia/Kolkata')
def rows = (records instanceof List ? records : []).collect { r -> (r instanceof Map && r.properties instanceof Map) ? r.properties : (r instanceof Map ? r : [:]) }
long winStart = (start ?: 0).toString().toBigDecimal().longValue()
long winEnd = (end ?: 0).toString().toBigDecimal().longValue()

// Slack timestamps are seconds with decimals, e.g. "1794646079.862783"
def tsMs = { ts ->
  if (!ts) return null
  try { return (new BigDecimal(ts.toString()) * 1000).longValue() } catch (Exception e) { return null }
}
def inWin = { ts -> def m = tsMs(ts); m != null && m >= winStart && m <= winEnd }
def esc = { s -> (s == null ? '' : s.toString()).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;') }
def clean = { s -> (s ?: '').toString().replaceAll(/<@[A-Z0-9]+>/, '').trim() }
def hhmm = { ts -> def m = tsMs(ts); m == null ? '-' : Instant.ofEpochMilli(m).atZone(zone).format(DateTimeFormatter.ofPattern('dd MMM HH:mm')) }
def pct = { long a, long b -> b > 0 ? String.format('%.0f%%', a * 100.0d / b) : '-' }
def who = { r -> (r.askerName ?: r.askerEmail ?: r.slackUserId ?: 'Unknown').toString() }

// Questions asked in the window (the user's own message time)
def asked = rows.findAll { inWin(it.userThreadMessageTimestamp ?: it.headerThreadTs) }
// Feedback clicked in the window (any question from the last 7 days)
def fb = rows.findAll { (it.feedback in ['HELPFUL', 'NOT_HELPFUL']) && inWin(it.feedbackAtTs) }
// Continue / Escalate clicked in the window
def na = rows.findAll { (it.nextAction in ['CONTINUE', 'ESCALATED']) && inWin(it.nextActionAtTs) }

long nAsked = asked.size()
long sessions = asked.collect { it.headerThreadTs ?: it.messageId }.findAll { it }.unique().size()
long users = asked.collect { it.slackUserId ?: it.askerEmail }.findAll { it }.unique().size()
long helpful = fb.count { it.feedback == 'HELPFUL' }
long notHelpful = fb.count { it.feedback == 'NOT_HELPFUL' }
long nFb = helpful + notHelpful
long askedRated = asked.count { it.feedback in ['HELPFUL', 'NOT_HELPFUL'] }
long askedPending = nAsked - askedRated
long cont = na.count { it.nextAction == 'CONTINUE' }
long escalated = na.count { it.nextAction == 'ESCALATED' }
long byOther = fb.count { it.feedbackBySlackUserId && it.slackUserId && it.feedbackBySlackUserId != it.slackUserId }

def topUsers = asked.groupBy { who(it) }
  .collect { k, v -> [name: k, n: v.size(), nh: v.count { it.feedback == 'NOT_HELPFUL' }] }
  .sort { a, b -> (b.n <=> a.n) ?: (a.name <=> b.name) }
  .take(5)

def nhRows = fb.findAll { it.feedback == 'NOT_HELPFUL' }
  .sort { a, b ->
    int ea = a.nextAction == 'ESCALATED' ? 0 : 1
    int eb = b.nextAction == 'ESCALATED' ? 0 : 1
    (ea <=> eb) ?: ((a.feedbackAtTs ?: '').toString() <=> (b.feedbackAtTs ?: '').toString())
  }

def td = 'padding:6px 10px;border:1px solid #ddd;'
def th = td + 'background:#f3f4f6;text-align:left;'
def card = { String label, Object value, String note ->
  '<td style="padding:10px 14px;border:1px solid #ddd;"><div style="font-size:12px;color:#555;">' + label +
  '</div><div style="font-size:22px;font-weight:bold;">' + value + '</div><div style="font-size:11px;color:#777;">' + note + '</div></td>'
}
def row2 = { a, b -> '<tr><td style="' + td + '">' + a + '</td><td style="' + td + '">' + b + '</td></tr>' }

def sb = new StringBuilder()
sb.append('<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111;">')
sb.append('<p><b>P2P Text2SQL Assistant - Slack feedback, last 24 hours</b><br><span style="font-size:12px;color:#555;">' + esc(windowDisplay) + '</span></p>')
if (nAsked == 0 && nFb == 0 && na.isEmpty()) {
  sb.append('<p>No questions and no feedback in the last 24 hours.</p>')
} else {
  sb.append('<table style="border-collapse:collapse;margin-bottom:14px;"><tr>')
  sb.append(card('Questions asked', nAsked, sessions + ' sessions, ' + users + ' users'))
  sb.append(card('Feedback received', nFb, helpful + ' helpful / ' + notHelpful + ' not helpful'))
  sb.append(card('Helpful', pct(helpful, nFb), 'of feedback received'))
  sb.append(card('Escalated to Finance', escalated, 'in the last 24 hours'))
  sb.append(card('Response rate', pct(askedRated, nAsked), askedRated + ' of ' + nAsked + ' new questions rated'))
  sb.append('</tr></table>')

  sb.append('<p><b>Counts</b></p><table style="border-collapse:collapse;">')
  sb.append('<tr><th style="' + th + '">Metric</th><th style="' + th + '">Count</th></tr>')
  sb.append(row2('Questions asked', nAsked))
  sb.append(row2('Questions not rated yet', askedPending))
  sb.append(row2('Feedback: Helpful', helpful))
  sb.append(row2('Feedback: Not helpful', notHelpful))
  sb.append(row2('Not helpful - continued with agent', cont))
  sb.append(row2('Not helpful - escalated to Finance', escalated))
  sb.append(row2('Rated by someone other than the asker', byOther))
  sb.append('</table>')

  if (topUsers) {
    sb.append('<p><b>Most active users</b></p><table style="border-collapse:collapse;">')
    sb.append('<tr><th style="' + th + '">User</th><th style="' + th + '">Questions</th><th style="' + th + '">Not helpful</th></tr>')
    topUsers.each { u -> sb.append('<tr><td style="' + td + '">' + esc(u.name) + '</td><td style="' + td + '">' + u.n + '</td><td style="' + td + '">' + u.nh + '</td></tr>') }
    sb.append('</table>')
  }

  if (nhRows) {
    sb.append('<p><b>Not-helpful answers (' + nhRows.size() + ')</b></p><table style="border-collapse:collapse;">')
    sb.append('<tr><th style="' + th + '">Feedback at (IST)</th><th style="' + th + '">User</th><th style="' + th + '">Question</th><th style="' + th + '">Next step</th></tr>')
    nhRows.take(20).each { r ->
      def step = r.nextAction == 'ESCALATED' ? '<b>Escalated</b>' : (r.nextAction == 'CONTINUE' ? 'Continued' : 'None chosen')
      def q = esc(clean(r.content))
      if (q.length() > 300) q = q.substring(0, 300) + '...'
      sb.append('<tr><td style="' + td + '">' + hhmm(r.feedbackAtTs) + '</td><td style="' + td + '">' + esc(who(r)) + '</td><td style="' + td + '">' + q + '</td><td style="' + td + '">' + step + '</td></tr>')
    }
    sb.append('</table>')
    if (nhRows.size() > 20) sb.append('<p style="font-size:12px;color:#555;">Showing 20 of ' + nhRows.size() + '.</p>')
  }
}
sb.append('<p style="font-size:11px;color:#777;">Source: p2p_feedback_collector. Questions are counted by when they were asked; feedback and next steps by when they were clicked, including clicks on questions from the previous 7 days.</p></div>')

def subject = (nAsked == 0 && nFb == 0 && na.isEmpty()) ?
  ('P2P Assistant feedback - last 24h to ' + dateDisplay + ': no activity') :
  ('P2P Assistant feedback - last 24h to ' + dateDisplay + ': ' + nAsked + ' questions, ' + helpful + ' helpful / ' + notHelpful + ' not helpful, ' + escalated + ' escalated')

result = [subject: subject.toString(), html: sb.toString(), questions: nAsked, sessions: sessions, users: users,
          helpful: helpful, notHelpful: notHelpful, pending: askedPending, continued: cont, escalated: escalated]
