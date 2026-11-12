using System.Globalization;
using System.Text;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

/// <summary>
/// Calendar export (SRS 4.11): an iCalendar (.ics) file with a stable UID per event, so re-importing an updated file
/// replaces the earlier entry, and a CANCEL file once the event is cancelled. No calendar write access is requested.
/// </summary>
public sealed class CalendarService(AuthDbContext db, NotificationService notifications)
{
    private static readonly DateTimeOffset SequenceEpoch = new(2024, 1, 1, 0, 0, 0, TimeSpan.Zero);

    public async Task<(string Content, string FileName)?> BuildIcsAsync(Guid eventId, Guid? requesterId, bool isPlatformAdmin)
    {
        var ev = await GetExportableEventAsync(eventId, requesterId, isPlatformAdmin);
        if (ev is null) return null;

        var zone = ResolveZone(ev.Timezone);
        var zoneId = zone == TimeZoneInfo.Utc ? "UTC" : ev.Timezone;
        var start = TimeZoneInfo.ConvertTime(ev.StartDateUtc, zone);
        var end = TimeZoneInfo.ConvertTime(ev.EndDateUtc, zone);
        var modified = ev.UpdatedAt ?? ev.CreatedAt;
        var sequence = Math.Max(0, (long)(modified - SequenceEpoch).TotalSeconds);

        var lines = new List<string>
        {
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//BiletFlow//Event Calendar Export//EN",
            "CALSCALE:GREGORIAN",
            ev.IsCancelled ? "METHOD:CANCEL" : "METHOD:PUBLISH",
            "BEGIN:VTIMEZONE",
            $"TZID:{zoneId}",
            "BEGIN:STANDARD",
            $"DTSTART:{start.DateTime:yyyyMMdd}T000000",
            $"TZOFFSETFROM:{FormatOffset(zone.GetUtcOffset(ev.StartDateUtc))}",
            $"TZOFFSETTO:{FormatOffset(zone.GetUtcOffset(ev.StartDateUtc))}",
            "END:STANDARD",
            "END:VTIMEZONE",
            "BEGIN:VEVENT",
            $"UID:{ev.Id}@biletflow",
            $"SEQUENCE:{sequence}",
            $"DTSTAMP:{DateTimeOffset.UtcNow.UtcDateTime:yyyyMMdd'T'HHmmss'Z'}",
            $"LAST-MODIFIED:{modified.UtcDateTime:yyyyMMdd'T'HHmmss'Z'}",
            $"DTSTART;TZID={zoneId}:{start.DateTime:yyyyMMdd'T'HHmmss}",
            $"DTEND;TZID={zoneId}:{end.DateTime:yyyyMMdd'T'HHmmss}",
            $"SUMMARY:{Escape((ev.IsCancelled ? "CANCELLED: " : string.Empty) + ev.Title)}",
            $"DESCRIPTION:{Escape($"{ev.Description}\n\n{EventUrl(ev)}")}",
            $"LOCATION:{Escape(Location(ev))}",
            $"URL:{EventUrl(ev)}",
            ev.IsCancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
            "END:VEVENT",
            "END:VCALENDAR"
        };

        var builder = new StringBuilder();
        foreach (var line in lines) builder.Append(Fold(line)).Append("\r\n");
        return (builder.ToString(), $"{(string.IsNullOrWhiteSpace(ev.Slug) ? ev.Id.ToString() : ev.Slug)}.ics");
    }

    public async Task<CalendarLinksResponse?> GetLinksAsync(Guid eventId, Guid? requesterId, bool isPlatformAdmin)
    {
        var ev = await GetExportableEventAsync(eventId, requesterId, isPlatformAdmin);
        if (ev is null) return null;

        var details = $"{ev.Description}\n\n{EventUrl(ev)}";
        var google = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
            $"&text={Uri.EscapeDataString(ev.Title)}" +
            $"&dates={ev.StartDateUtc.UtcDateTime:yyyyMMdd'T'HHmmss'Z'}/{ev.EndDateUtc.UtcDateTime:yyyyMMdd'T'HHmmss'Z'}" +
            $"&ctz={Uri.EscapeDataString(ev.Timezone)}" +
            $"&details={Uri.EscapeDataString(Truncate(details, 1500))}" +
            $"&location={Uri.EscapeDataString(Location(ev))}";
        var outlook = "https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent" +
            $"&subject={Uri.EscapeDataString(ev.Title)}" +
            $"&startdt={Uri.EscapeDataString(ev.StartDateUtc.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture))}" +
            $"&enddt={Uri.EscapeDataString(ev.EndDateUtc.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture))}" +
            $"&body={Uri.EscapeDataString(Truncate(details, 1500))}" +
            $"&location={Uri.EscapeDataString(Location(ev))}";
        return new CalendarLinksResponse(ev.Id, $"/api/events/{ev.Id}/calendar.ics", google, outlook, ev.Timezone, ev.IsCancelled);
    }

    /// <summary>
    /// Anyone who could see the event page may export it. A cancelled event stays exportable (as a cancellation) for
    /// visitors of public/unlisted events and for its ticket holders, so they can remove it from their calendars.
    /// </summary>
    private async Task<Event?> GetExportableEventAsync(Guid eventId, Guid? requesterId, bool isPlatformAdmin)
    {
        var ev = await db.Events.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return null;
        if (isPlatformAdmin || requesterId == ev.OrganizerId) return ev;

        var hasOrder = requesterId is not null && await db.Orders.AnyAsync(order =>
            order.EventId == eventId && order.AttendeeId == requesterId && order.Status != OrderStatus.Pending);
        if (hasOrder) return ev;
        if (ev.IsSuspended || ev.Visibility == EventVisibility.Private) return null;
        if (ev.IsCancelled) return ev;
        return ev.IsPublished ? ev : null;
    }

    private string EventUrl(Event ev) => notifications.AppUrl($"/events/{ev.Id}");

    private static string Location(Event ev) =>
        string.Join(", ", new[] { ev.Venue, ev.VenueAddress, ev.City }.Where(part => !string.IsNullOrWhiteSpace(part)).Distinct());

    private static TimeZoneInfo ResolveZone(string timezone) =>
        TimeZoneInfo.TryFindSystemTimeZoneById(timezone, out var zone) ? zone : TimeZoneInfo.Utc;

    private static string FormatOffset(TimeSpan offset) =>
        $"{(offset < TimeSpan.Zero ? "-" : "+")}{Math.Abs(offset.Hours):00}{Math.Abs(offset.Minutes):00}";

    private static string Escape(string value) => value
        .Replace("\\", "\\\\", StringComparison.Ordinal)
        .Replace(";", "\\;", StringComparison.Ordinal)
        .Replace(",", "\\,", StringComparison.Ordinal)
        .Replace("\r\n", "\\n", StringComparison.Ordinal)
        .Replace("\n", "\\n", StringComparison.Ordinal);

    /// <summary>Folds a content line at 75 octets as required by RFC 5545, without splitting UTF-8 characters.</summary>
    private static string Fold(string line)
    {
        if (Encoding.UTF8.GetByteCount(line) <= 75) return line;
        var builder = new StringBuilder();
        var count = 0;
        foreach (var rune in line.EnumerateRunes())
        {
            var size = rune.Utf8SequenceLength;
            if (count + size > 75)
            {
                builder.Append("\r\n ");
                count = 1;
            }

            builder.Append(rune.ToString());
            count += size;
        }

        return builder.ToString();
    }

    private static string Truncate(string value, int length) => value.Length > length ? value[..length] : value;
}
