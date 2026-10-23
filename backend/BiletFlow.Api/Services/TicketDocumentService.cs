using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;
using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;

namespace BiletFlow.Api.Services;

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
        if (order.AttendeeId != requesterId && order.Event.OrganizerId != requesterId && !isPlatformAdmin)
        {
            return null;
        }

        using var qrGenerator = new QRCodeGenerator();
        using var qrData = qrGenerator.CreateQrCode(ticket.Code, QRCodeGenerator.ECCLevel.Q);
        var qrPng = new PngByteQRCode(qrData).GetGraphic(10);
        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(28);
                page.DefaultTextStyle(style => style.FontSize(11));
                page.Content().Column(column =>
                {
                    column.Spacing(8);
                    column.Item().Text(ticket.Event.Title).FontSize(22).Bold();
                    column.Item().Text($"{ticket.Event.StartDateUtc:yyyy-MM-dd HH:mm} UTC");
                    column.Item().Text($"{ticket.Event.Venue}, {ticket.Event.City}");
                    column.Item().LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                    column.Item().Text($"Ticket: {ticket.OrderItem.TicketType.Name}").Bold();
                    column.Item().Text($"Attendee: {ticket.AttendeeName}");
                    column.Item().Text($"Ticket ID: {ticket.Code}").FontSize(9);
                    column.Item().Text($"Status: {ticket.Status}");
                    column.Item().AlignCenter().Width(190).Height(190).Image(qrPng).FitArea();
                    column.Item().AlignCenter().Text("Present this QR code at event entry.").FontSize(9);
                });
            });
        }).GeneratePdf();
    }
}
