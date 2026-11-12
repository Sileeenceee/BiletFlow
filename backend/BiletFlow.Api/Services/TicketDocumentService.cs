using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;
using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;

namespace BiletFlow.Api.Services;

/// <summary>
/// Print-optimized PDF ticket (SRS 4.7, UC7) generated from the canonical ticket record. The QR code carries the same
/// ticket code as the digital ticket, so a paper copy never creates a second admission. No payment data is printed.
/// </summary>
public sealed class TicketDocumentService(AuthDbContext db)
{
    static TicketDocumentService()
    {
        QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
    }

    public async Task<byte[]?> CreatePdfAsync(Guid ticketId, Guid requesterId, bool isPlatformAdmin)
    {
        var ticket = await db.Tickets
            .Include(candidate => candidate.Event)
            .Include(candidate => candidate.Seat)
                .ThenInclude(seat => seat!.Section)
            .Include(candidate => candidate.OrderItem)
                .ThenInclude(item => item.Order)
            .Include(candidate => candidate.OrderItem)
                .ThenInclude(item => item.TicketType)
            .SingleOrDefaultAsync(candidate => candidate.Id == ticketId);
        if (ticket is null || ticket.Status is TicketStatus.Cancelled or TicketStatus.Refunded ||
            ticket.Event.IsCancelled)
        {
            return null;
        }

        var order = ticket.OrderItem.Order;
        if (order.AttendeeId != requesterId && ticket.Event.OrganizerId != requesterId && !isPlatformAdmin)
        {
            return null;
        }

        var ev = ticket.Event;
        var zone = TimeZoneInfo.TryFindSystemTimeZoneById(ev.Timezone, out var found) ? found : TimeZoneInfo.Utc;
        var start = TimeZoneInfo.ConvertTime(ev.StartDateUtc, zone);
        var end = TimeZoneInfo.ConvertTime(ev.EndDateUtc, zone);
        var offset = zone.GetUtcOffset(ev.StartDateUtc);
        var when = $"{start:dddd, d MMMM yyyy, HH:mm}–{end:HH:mm} ({ev.Timezone}, UTC{(offset < TimeSpan.Zero ? "-" : "+")}{offset:hh\\:mm})";
        var where = string.Join(", ", new[] { ev.Venue, ev.VenueAddress, ev.City }
            .Where(part => !string.IsNullOrWhiteSpace(part)).Distinct());

        using var qrGenerator = new QRCodeGenerator();
        using var qrData = qrGenerator.CreateQrCode(ticket.Code, QRCodeGenerator.ECCLevel.Q);
        // Pure black on white with a quiet zone keeps the code scannable on grayscale prints.
        var qrPng = new PngByteQRCode(qrData).GetGraphic(20, [0, 0, 0], [255, 255, 255], drawQuietZones: true);

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(40);
                page.DefaultTextStyle(style => style.FontSize(12).FontColor(Colors.Black));
                page.Content().Column(column =>
                {
                    column.Spacing(10);
                    column.Item().Text("BiletFlow — Admission ticket").FontSize(10).SemiBold();
                    column.Item().Text(ev.Title).FontSize(26).Bold();
                    column.Item().Text(when);
                    column.Item().Text(where);
                    column.Item().LineHorizontal(1).LineColor(Colors.Grey.Darken1);
                    column.Item().Text($"Ticket type: {ticket.OrderItem.TicketType.Name}").FontSize(14).Bold();
                    column.Item().Text($"Attendee: {ticket.AttendeeName}").FontSize(14);
                    if (ticket.Seat is not null)
                    {
                        column.Item().Text(
                            $"Section {ticket.Seat.Section.Name}   Row {ticket.Seat.RowLabel}   Seat {ticket.Seat.Number}" +
                            (ticket.Seat.IsAccessible ? "   (accessible seat)" : string.Empty)).FontSize(16).Bold();
                    }

                    column.Item().PaddingTop(10).AlignCenter().Width(260).Height(260).Image(qrPng).FitArea();
                    column.Item().AlignCenter().Text($"Ticket ID: {ticket.Code}").FontSize(9);
                    column.Item().AlignCenter().Text("Present this QR code at the entrance. Printed and digital copies are the same ticket and admit once.").FontSize(9);
                    column.Item().PaddingTop(16).Text("Not valid if the order was cancelled or refunded. Status is checked online at entry.")
                        .FontSize(8).FontColor(Colors.Grey.Darken2);
                });
            });
        }).GeneratePdf();
    }
}
