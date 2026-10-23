using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

public sealed class SupportService(AuthDbContext db, AuditService audit)
{
    private static readonly HashSet<string> AttendeeCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "ticket delivery", "payment", "refund", "seating", "event information", "check-in", "account", "technical problem"
    };

    private static readonly HashSet<string> OrganizerCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "account", "activation", "payment", "technical problem"
    };

    public async Task<(SupportCaseResponse? Case, string? Error)> CreateAsync(
        Guid userId, CreateSupportCaseRequest request)
    {
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null || user.IsSuspended) return (null, "User not found.");
        var type = user.Role switch
        {
            UserRole.Attendee => SupportCaseType.Attendee,
            UserRole.Organizer => SupportCaseType.Organizer,
            _ => (SupportCaseType?)null
        };
        if (type is null) return (null, "Only attendees and organizers can open support cases.");
        if (string.IsNullOrWhiteSpace(request.Subject) || string.IsNullOrWhiteSpace(request.Message))
        {
            return (null, "Subject and initial message are required.");
        }

        var category = request.Category?.Trim() ?? string.Empty;
        var allowedCategories = type == SupportCaseType.Attendee ? AttendeeCategories : OrganizerCategories;
        if (!allowedCategories.Contains(category)) return (null, "The selected support category is not valid for this account.");

        var (eventId, orderId, ticketId, contextError) = await ResolveContextAsync(userId, type.Value, request);
        if (contextError is not null) return (null, contextError);

        var now = DateTimeOffset.UtcNow;
        var supportCase = new SupportCase
        {
            RequesterUserId = userId,
            Type = type.Value,
            Category = category,
            Subject = request.Subject.Trim(),
            EventId = eventId,
            OrderId = orderId,
            TicketId = ticketId,
            Status = SupportCaseStatus.Open,
            CreatedAt = now,
            UpdatedAt = now
        };
        supportCase.Messages.Add(new SupportMessage
        {
            SenderUserId = userId,
            Body = request.Message.Trim(),
            CreatedAt = now
        });
        db.SupportCases.Add(supportCase);
        audit.Add(AuditActionType.SupportCaseCreated, nameof(SupportCase), supportCase.Id, eventId, userId,
            $"Support case '{supportCase.Subject}' opened.");
        await NotifyStaffAsync(supportCase, userId, "New support case", $"A new support case was opened: {supportCase.Subject}");
        await db.SaveChangesAsync();
        await db.Entry(supportCase).Collection(candidate => candidate.Messages).Query()
            .Include(message => message.Sender).LoadAsync();
        return (ToResponse(supportCase), null);
    }

    public async Task<IReadOnlyList<SupportCaseResponse>> GetCasesAsync(Guid userId, bool isPlatformAdmin)
    {
        var query = AccessibleCasesQuery(userId, isPlatformAdmin);
        var cases = await query.Include(supportCase => supportCase.Messages)
            .ThenInclude(message => message.Sender)
            .OrderByDescending(supportCase => supportCase.UpdatedAt)
            .ToListAsync();
        return cases.Select(ToResponse).ToList();
    }

    public async Task<SupportCaseResponse?> GetCaseAsync(Guid caseId, Guid userId, bool isPlatformAdmin)
    {
        var supportCase = await AccessibleCasesQuery(userId, isPlatformAdmin)
            .Include(candidate => candidate.Messages)
            .ThenInclude(message => message.Sender)
            .SingleOrDefaultAsync(candidate => candidate.Id == caseId);
        return supportCase is null ? null : ToResponse(supportCase);
    }

    public async Task<(SupportCaseResponse? Case, string? Error)> AddMessageAsync(
        Guid caseId, Guid userId, string body, bool isPlatformAdmin)
    {
        if (string.IsNullOrWhiteSpace(body) || body.Trim().Length > 4000)
        {
            return (null, "Message must contain 1-4000 characters.");
        }

        var supportCase = await AccessibleCasesQuery(userId, isPlatformAdmin)
            .Include(candidate => candidate.Messages)
            .ThenInclude(message => message.Sender)
            .SingleOrDefaultAsync(candidate => candidate.Id == caseId);
        if (supportCase is null) return (null, "Support case not found.");
        if (supportCase.Status == SupportCaseStatus.Resolved)
        {
            return (null, "A resolved case cannot receive new messages.");
        }

        var message = new SupportMessage
        {
            CaseId = supportCase.Id,
            SenderUserId = userId,
            Body = body.Trim()
        };
        db.SupportMessages.Add(message);
        supportCase.UpdatedAt = DateTimeOffset.UtcNow;
        await NotifyOtherParticipantsAsync(supportCase, userId, "New support reply", $"New reply in support case: {supportCase.Subject}");
        audit.Add(AuditActionType.SupportMessageCreated, nameof(SupportMessage), message.Id,
            supportCase.EventId, userId, $"Reply added to support case '{supportCase.Subject}'.");
        await db.SaveChangesAsync();

        message.Sender = await db.Users.SingleAsync(candidate => candidate.Id == userId);
        supportCase.Messages.Add(message);
        return (ToResponse(supportCase), null);
    }

    public async Task<(SupportCaseResponse? Case, string? Error)> UpdateCaseAsync(
        Guid caseId, Guid staffUserId, bool isPlatformAdmin, UpdateSupportCaseRequest request)
    {
        var supportCase = await db.SupportCases
            .Include(candidate => candidate.Event)
            .Include(candidate => candidate.Messages)
                .ThenInclude(message => message.Sender)
            .SingleOrDefaultAsync(candidate => candidate.Id == caseId);
        if (supportCase is null) return (null, "Support case not found.");
        if (!await IsStaffForCaseAsync(supportCase, staffUserId, isPlatformAdmin))
        {
            return (null, "You are not authorized to manage this support case.");
        }

        if (request.Status is not null)
        {
            if (!TryParseStatus(request.Status, out var nextStatus))
            {
                return (null, "Status must be Open, In Progress, Waiting for Customer, or Resolved.");
            }

            supportCase.Status = nextStatus;
        }

        if (request.ClearAssignment)
        {
            supportCase.AssignedToUserId = null;
        }
        else if (request.AssignedToUserId is not null)
        {
            var assignee = await db.Users.SingleOrDefaultAsync(user => user.Id == request.AssignedToUserId);
            if (assignee is null || assignee.IsSuspended ||
                !await IsStaffForCaseAsync(supportCase, assignee.Id, assignee.Role == UserRole.PlatformAdmin))
            {
                return (null, "Assignee must be an active staff member authorized for this case.");
            }
            supportCase.AssignedToUserId = assignee.Id;
            audit.Add(AuditActionType.SupportCaseAssigned, nameof(SupportCase), supportCase.Id,
                supportCase.EventId, staffUserId, "Support case assigned to staff.");
        }

        supportCase.UpdatedAt = DateTimeOffset.UtcNow;
        audit.Add(AuditActionType.SupportCaseStatusChanged, nameof(SupportCase), supportCase.Id,
            supportCase.EventId, staffUserId, $"Support case status changed to {FormatStatus(supportCase.Status)}.");
        AddNotification(supportCase.RequesterUserId, supportCase.Id, "Support status changed",
            $"Your support case status is now {FormatStatus(supportCase.Status)}.", staffUserId);
        await db.SaveChangesAsync();
        return (ToResponse(supportCase), null);
    }

    private IQueryable<SupportCase> AccessibleCasesQuery(Guid userId, bool isPlatformAdmin) =>
        db.SupportCases.Where(supportCase =>
            isPlatformAdmin ||
            supportCase.RequesterUserId == userId ||
            supportCase.AssignedToUserId == userId ||
            (supportCase.Type == SupportCaseType.Attendee && supportCase.Event != null &&
             supportCase.Event.OrganizerId == userId));

    private async Task<bool> IsStaffForCaseAsync(SupportCase supportCase, Guid userId, bool isPlatformAdmin)
    {
        if (isPlatformAdmin) return true;
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null || user.IsSuspended || user.Role != UserRole.Organizer) return false;
        return supportCase.Type == SupportCaseType.Attendee && supportCase.EventId is not null &&
            await db.Events.AnyAsync(ev => ev.Id == supportCase.EventId && ev.OrganizerId == userId);
    }

    private async Task<(Guid? EventId, Guid? OrderId, Guid? TicketId, string? Error)> ResolveContextAsync(
        Guid userId, SupportCaseType type, CreateSupportCaseRequest request)
    {
        Guid? eventId = request.EventId;
        Guid? orderId = request.OrderId;
        Guid? ticketId = request.TicketId;
        if (orderId is not null)
        {
            var order = await db.Orders.Include(candidate => candidate.Event)
                .SingleOrDefaultAsync(candidate => candidate.Id == orderId);
            if (order is null) return (null, null, null, "Order not found.");
            if (eventId is not null && eventId != order.EventId) return (null, null, null, "Order does not belong to the selected event.");
            eventId ??= order.EventId;
            if (type == SupportCaseType.Attendee && order.AttendeeId != userId)
            {
                return (null, null, null, "You can only open support cases for your own orders.");
            }
            if (type == SupportCaseType.Organizer && order.Event.OrganizerId != userId)
            {
                return (null, null, null, "Organizer support context must belong to your event.");
            }
        }

        if (ticketId is not null)
        {
            var ticket = await db.Tickets.Include(candidate => candidate.Event)
                .Include(candidate => candidate.OrderItem)
                    .ThenInclude(item => item.Order)
                .SingleOrDefaultAsync(candidate => candidate.Id == ticketId);
            if (ticket is null) return (null, null, null, "Ticket not found.");
            if (eventId is not null && eventId != ticket.EventId) return (null, null, null, "Ticket does not belong to the selected event.");
            if (orderId is not null && orderId != ticket.OrderItem.OrderId) return (null, null, null, "Ticket does not belong to the selected order.");
            eventId ??= ticket.EventId;
            orderId ??= ticket.OrderItem.OrderId;
            if (type == SupportCaseType.Attendee && ticket.OrderItem.Order.AttendeeId != userId)
            {
                return (null, null, null, "You can only open support cases for your own tickets.");
            }
            if (type == SupportCaseType.Organizer && ticket.Event.OrganizerId != userId)
            {
                return (null, null, null, "Organizer support context must belong to your event.");
            }
        }

        if (eventId is not null && orderId is null && ticketId is null)
        {
            var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
            if (ev is null) return (null, null, null, "Event not found.");
            if (type == SupportCaseType.Attendee &&
                (!ev.IsPublished || ev.IsCancelled || ev.Visibility == EventVisibility.Private))
            {
                return (null, null, null, "Event not found.");
            }
            if (type == SupportCaseType.Organizer && ev.OrganizerId != userId)
            {
                return (null, null, null, "Organizer support context must belong to your event.");
            }
        }

        return (eventId, orderId, ticketId, null);
    }

    private async Task NotifyStaffAsync(SupportCase supportCase, Guid senderId, string title, string message)
    {
        var recipients = supportCase.Type == SupportCaseType.Organizer
            ? await db.Users.Where(user => user.Role == UserRole.PlatformAdmin && !user.IsSuspended)
                .Select(user => user.Id).ToListAsync()
            : supportCase.EventId is not null
                ? await db.Events.Where(ev => ev.Id == supportCase.EventId)
                    .Select(ev => ev.OrganizerId).ToListAsync()
                : await db.Users.Where(user => user.Role == UserRole.PlatformAdmin && !user.IsSuspended)
                    .Select(user => user.Id).ToListAsync();
        foreach (var recipient in recipients.Where(id => id != senderId).Distinct())
        {
            AddNotification(recipient, supportCase.Id, title, message, senderId);
        }
    }

    private async Task NotifyOtherParticipantsAsync(SupportCase supportCase, Guid senderId, string title, string message)
    {
        var recipients = new HashSet<Guid> { supportCase.RequesterUserId };
        if (supportCase.Type == SupportCaseType.Organizer)
        {
            var admins = await db.Users.Where(user => user.Role == UserRole.PlatformAdmin && !user.IsSuspended)
                .Select(user => user.Id).ToListAsync();
            recipients.UnionWith(admins);
        }
        else if (supportCase.EventId is not null)
        {
            var organizerId = await db.Events.Where(ev => ev.Id == supportCase.EventId)
                .Select(ev => (Guid?)ev.OrganizerId).SingleOrDefaultAsync();
            if (organizerId is not null) recipients.Add(organizerId.Value);
        }
        else
        {
            var admins = await db.Users.Where(user => user.Role == UserRole.PlatformAdmin && !user.IsSuspended)
                .Select(user => user.Id).ToListAsync();
            recipients.UnionWith(admins);
        }

        foreach (var recipient in recipients.Where(id => id != senderId))
        {
            AddNotification(recipient, supportCase.Id, title, message, senderId);
        }
    }

    private void AddNotification(Guid userId, Guid caseId, string title, string message, Guid senderId)
    {
        if (userId == senderId) return;
        db.InAppNotifications.Add(new InAppNotification
        {
            UserId = userId,
            RelatedCaseId = caseId,
            Type = "Support",
            Title = title,
            Message = message.Length > 500 ? message[..500] : message
        });
    }

    private static SupportCaseResponse ToResponse(SupportCase supportCase) =>
        new(supportCase.Id, supportCase.Type.ToString(), supportCase.Category, supportCase.Subject,
            FormatStatus(supportCase.Status), supportCase.RequesterUserId, supportCase.EventId,
            supportCase.OrderId, supportCase.TicketId, supportCase.AssignedToUserId,
            supportCase.CreatedAt, supportCase.UpdatedAt,
            supportCase.Messages.OrderBy(message => message.CreatedAt)
                .Select(message => new SupportMessageResponse(message.Id, message.SenderUserId,
                    message.Sender.Role.ToString(), message.Body, message.CreatedAt))
                .ToList());

    private static bool TryParseStatus(string value, out SupportCaseStatus status)
    {
        var normalized = value.Replace(" ", string.Empty, StringComparison.Ordinal)
            .Replace("-", string.Empty, StringComparison.Ordinal);
        return Enum.TryParse(normalized, true, out status) && Enum.IsDefined(status);
    }

    private static string FormatStatus(SupportCaseStatus status) => status switch
    {
        SupportCaseStatus.InProgress => "In Progress",
        SupportCaseStatus.WaitingForCustomer => "Waiting for Customer",
        _ => status.ToString()
    };
}
