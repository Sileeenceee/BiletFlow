using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

/// <summary>
/// Creates in-app notifications (saved with the caller's unit of work) and collects emails for the request.
/// Emails are handed to the sender only after the request succeeded (see <see cref="FlushEmails"/>), so a
/// rolled-back action never emails anyone.
/// </summary>
public sealed class NotificationService(AuthDbContext db, EmailQueue emailQueue, IConfiguration configuration)
{
    private readonly List<EmailMessage> pendingEmails = [];

    public string AppUrl(string path) =>
        $"{(configuration["PublicAppBaseUrl"] ?? "http://localhost:8080").TrimEnd('/')}/{path.TrimStart('/')}";

    /// <summary>Adds an in-app notification and, when <paramref name="email"/> is given, queues an email.</summary>
    public void Notify(
        Guid userId, string type, string title, string message,
        Guid? eventId = null, Guid? orderId = null, Guid? caseId = null,
        string? email = null, string? emailBody = null)
    {
        db.InAppNotifications.Add(new InAppNotification
        {
            UserId = userId,
            Type = Truncate(type, 40),
            Title = Truncate(title, 160),
            Message = Truncate(message, 500),
            RelatedEventId = eventId,
            RelatedOrderId = orderId,
            RelatedCaseId = caseId
        });
        if (!string.IsNullOrWhiteSpace(email)) QueueEmail(email, title, emailBody ?? message);
    }

    /// <summary>Notifies a user and emails the address of their account.</summary>
    public async Task NotifyUserAsync(
        Guid userId, string type, string title, string message,
        Guid? eventId = null, Guid? orderId = null, Guid? caseId = null, string? emailBody = null)
    {
        var email = await db.Users.Where(user => user.Id == userId).Select(user => user.Email).SingleOrDefaultAsync();
        if (email is null) return;
        Notify(userId, type, title, message, eventId, orderId, caseId, email, emailBody);
    }

    public async Task NotifyPlatformAdminsAsync(string type, string title, string message, Guid? eventId = null,
        Guid? caseId = null, Guid? exceptUserId = null)
    {
        var admins = await db.Users
            .Where(user => user.Role == UserRole.PlatformAdmin && !user.IsSuspended && user.Id != exceptUserId)
            .Select(user => new { user.Id, user.Email })
            .ToListAsync();
        foreach (var admin in admins) Notify(admin.Id, type, title, message, eventId, null, caseId, admin.Email);
    }

    public void QueueEmail(string to, string subject, string body) =>
        pendingEmails.Add(new EmailMessage(to, subject, body + "\n\n— BiletFlow (academic demonstration; no real payments are made)"));

    /// <summary>Hands the collected emails to the background sender. Called after a successful response.</summary>
    public void FlushEmails()
    {
        foreach (var email in pendingEmails) emailQueue.Enqueue(email);
        pendingEmails.Clear();
    }

    private static string Truncate(string value, int length) => value.Length > length ? value[..length] : value;
}
