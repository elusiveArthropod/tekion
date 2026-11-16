import java.time.*
import java.time.format.DateTimeFormatter

def zone = ZoneId.of('Asia/Kolkata')
def today = LocalDate.now(zone)
def day = today.minusDays(1)
long startMs = day.atStartOfDay(zone).toInstant().toEpochMilli()
long endMs = today.atStartOfDay(zone).toInstant().toEpochMilli() - 1
result = [start: startMs, end: endMs, dateLabel: day.toString(), dateDisplay: day.format(DateTimeFormatter.ofPattern('EEE, dd MMM yyyy'))]
