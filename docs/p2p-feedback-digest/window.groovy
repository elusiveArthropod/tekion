import java.time.*
import java.time.format.DateTimeFormatter

// Rolling window: the 24 hours before this run. Records are fetched from 7 days back,
// so feedback clicked in the window on an older question is still counted.
def zone = ZoneId.of('Asia/Kolkata')
long endMs = System.currentTimeMillis()
long startMs = endMs - 24L * 60 * 60 * 1000
long fetchFromMs = startMs - 7L * 24 * 60 * 60 * 1000
def fmt = DateTimeFormatter.ofPattern('dd MMM yyyy, HH:mm')
def s = Instant.ofEpochMilli(startMs).atZone(zone)
def e = Instant.ofEpochMilli(endMs).atZone(zone)
result = [start: startMs, end: endMs, fetchFrom: fetchFromMs,
          windowDisplay: s.format(fmt) + ' to ' + e.format(fmt) + ' IST',
          dateDisplay: e.format(DateTimeFormatter.ofPattern('EEE, dd MMM yyyy'))]
