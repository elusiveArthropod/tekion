import java.time.*
import java.time.format.DateTimeFormatter

def zone = ZoneId.of('Asia/Kolkata')
def rows = (records instanceof List ? records : []).collect { r -> (r instanceof Map && r.properties instanceof Map) ? r.properties : (r instanceof Map ? r : [:]) }

def esc = { s -> (s == null ? '' : s.toString()).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;') }
def clean = { s -> (s ?: '').toString().replaceAll(/<@[A-Z0-9]+>/, '').trim() }
def tsTime = { ts ->
  if (!ts) return '-'
  try {
    Instant.ofEpochMilli((new BigDecimal(ts.toString()) * 1000).longValue()).atZone(zone).format(DateTimeFormatter.ofPattern('HH:mm'))
  } catch (Exception e) { '-' }
}
def pct = { long a, long b -> b > 0 ? String.format('%.0f%%', a * 100.0d / b) : '-' }

long answers = rows.size()
long sessions = rows.collect { it.headerThreadTs ?: it.messageId }.findAll { it }.unique().size()
long users = rows.collect { it.slackUserId ?: it.askerEmail }.findAll { it }.unique().size()
long helpful = rows.count { it.feedback == 'HELPFUL' }
long notHelpful = rows.count { it.feedback == 'NOT_HELPFUL' }
long rated = helpful + notHelpful
long noClick = answers - rated
long cont = rows.count { it.nextAction == 'CONTINUE' }
long escalated = rows.count { it.nextAction == 'ESCALATED' }
long nhNoChoice = rows.count { it.feedback == 'NOT_HELPFUL' && !(it.nextAction in ['CONTINUE', 'ESCALATED']) }
long byOther = rows.count { it.feedbackBySlackUserId && it.slackUserId && it.feedbackBySlackUserId != it.slackUserId }

def topUsers = rows.groupBy { (it.askerName ?: it.askerEmail ?: it.slackUserId ?: 'Unknown').toString() }
  .collect { k, v -> [name: k, n: v.size(), nh: v.count { it.feedback == 'NOT_HELPFUL' }] }
  .sort { a, b -> (b.n <=> a.n) ?: (a.name <=> b.name) }
  .take(5)

def nhRows = rows.findAll { it.feedback == 'NOT_HELPFUL' }
  .sort { a, b ->
    int ea = a.nextAction == 'ESCALATED' ? 0 : 1
    int eb = b.nextAction == 'ESCALATED' ? 0 : 1
    (ea <=> eb) ?: ((a.userThreadMessageTimestamp ?: '').toString() <=> (b.userThreadMessageTimestamp ?: '').toString())
  }

def td = 'padding:6px 10px;border:1px solid #ddd;'
def th = td + 'background:#f3f4f6;text-align:left;'
def card = { String label, Object value, String note ->
  '<td style="padding:10px 14px;border:1px solid #ddd;"><div style="font-size:12px;color:#555;">' + label +
  '</div><div style="font-size:22px;font-weight:bold;">' + value + '</div><div style="font-size:11px;color:#777;">' + note + '</div></td>'
}

def sb = new StringBuilder()
sb.append('<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111;">')
sb.append('<p><b>P2P Text2SQL Assistant - daily Slack summary for ' + esc(dateDisplay) + ' (IST)</b></p>')
if (answers == 0) {
  sb.append('<p>No questions were answered in Slack on this day.</p>')
} else {
  sb.append('<table style="border-collapse:collapse;margin-bottom:14px;"><tr>')
  sb.append(card('Sessions', sessions, 'distinct Slack threads'))
  sb.append(card('Questions answered', answers, 'answers with feedback buttons'))
  sb.append(card('Users', users, 'distinct askers'))
  sb.append(card('Response rate', pct(rated, answers), rated + ' of ' + answers + ' rated'))
  sb.append(card('Helpful', pct(helpful, rated), helpful + ' helpful / ' + notHelpful + ' not helpful'))
  sb.append('</tr></table>')

  sb.append('<p><b>Feedback</b></p><table style="border-collapse:collapse;">')
  sb.append('<tr><th style="' + th + '">Metric</th><th style="' + th + '">Count</th></tr>')
  [['Helpful', helpful], ['Not helpful', notHelpful], ['No feedback given', noClick],
   ['Not helpful - continued with agent', cont], ['Not helpful - escalated to Finance', escalated],
   ['Not helpful - no next step chosen', nhNoChoice], ['Rated by someone other than the asker', byOther]].each { r ->
    sb.append('<tr><td style="' + td + '">' + r[0] + '</td><td style="' + td + '">' + r[1] + '</td></tr>')
  }
  sb.append('</table>')

  sb.append('<p><b>Most active users</b></p><table style="border-collapse:collapse;">')
  sb.append('<tr><th style="' + th + '">User</th><th style="' + th + '">Questions</th><th style="' + th + '">Not helpful</th></tr>')
  topUsers.each { u ->
    sb.append('<tr><td style="' + td + '">' + esc(u.name) + '</td><td style="' + td + '">' + u.n + '</td><td style="' + td + '">' + u.nh + '</td></tr>')
  }
  sb.append('</table>')

  if (nhRows) {
    sb.append('<p><b>Not-helpful answers (' + nhRows.size() + ')</b></p><table style="border-collapse:collapse;">')
    sb.append('<tr><th style="' + th + '">Time (IST)</th><th style="' + th + '">User</th><th style="' + th + '">Question</th><th style="' + th + '">Next step</th></tr>')
    nhRows.take(20).each { r ->
      def step = r.nextAction == 'ESCALATED' ? '<b>Escalated</b>' : (r.nextAction == 'CONTINUE' ? 'Continued' : 'None chosen')
      def q = esc(clean(r.content))
      if (q.length() > 300) q = q.substring(0, 300) + '...'
      sb.append('<tr><td style="' + td + '">' + tsTime(r.userThreadMessageTimestamp ?: r.headerThreadTs) + '</td><td style="' + td + '">' +
        esc(r.askerName ?: r.askerEmail ?: r.slackUserId) + '</td><td style="' + td + '">' + q + '</td><td style="' + td + '">' + step + '</td></tr>')
    }
    sb.append('</table>')
    if (nhRows.size() > 20) sb.append('<p style="font-size:12px;color:#555;">Showing 20 of ' + nhRows.size() + '.</p>')
  }
}
sb.append('<p style="font-size:11px;color:#777;">Source: p2p_feedback_collector, records created ' + esc(dateLabel) +
  ' 00:00-23:59 IST. Each question counts on the day it was asked; clicks made after midnight still count in that day.</p></div>')

def subject = answers == 0 ? ('P2P Assistant daily summary - ' + dateDisplay + ': no activity') :
  ('P2P Assistant daily summary - ' + dateDisplay + ': ' + answers + ' questions, ' + pct(helpful, rated) + ' helpful, ' + escalated + ' escalated')

result = [subject: subject.toString(), html: sb.toString(), answers: answers, sessions: sessions, users: users,
          helpful: helpful, notHelpful: notHelpful, noFeedback: noClick, continued: cont, escalated: escalated]
