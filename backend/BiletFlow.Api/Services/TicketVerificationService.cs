using System.Data;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BiletFlow.Api.Services;

public sealed class TicketVerificationService(AuthDbContext db, AuditService audit)
{
    public async Task<IReadOnlyList<Event>?> GetAssignedEventsAsync(Guid userId)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null || user.Role != UserRole.EventAdmin || user.IsSuspended) return null;
        return await db.EventAdminAssignments
            .Where(assignment => assignment.UserId == userId && !assignment.Event.IsCancelled)
            .Select(assignment => assignment.Event)
            .OrderBy(ev => ev.StartDateUtc)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<EventAdminResponse>?> GetEventAdminsAsync(
        Guid eventId, Guid requesterId, bool isPlatformAdmin)
    {
        if (!await db.Events.AnyAsync(ev =>
            ev.Id == eventId && (ev.OrganizerId == requesterId || isPlatformAdmin)))
        {
            return null;
        }

        return await db.EventAdminAssignments
            .Where(assignment => assignment.EventId == eventId)
            .OrderBy(assignment => assignment.User.Email)
            .Select(assignment => new EventAdminResponse(
                assignment.UserId, assignment.User.Email, assignment.AssignedAt))
            .ToListAsync();
    }

    public async Task<(bool Assigned, string? Error)> AssignAsync(
        Guid eventId, Guid organizerId, bool isPlatformAdmin, string email)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == organizerId || isPlatformAdmin));
        if (ev is null) return (false, "Event not found.");
        if (ev.IsCancelled) return (false, "Cannot assign staff to a cancelled event.");

        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Email == normalizedEmail);
        if (user is null || user.IsSuspended || !user.EmailConfirmed)
        {
            return (false, "An active account with a verified email address was not found.");
        }
        if (user.Role is UserRole.Organizer or UserRole.PlatformAdmin)
        {
            return (false, "An organizer or platform administrator cannot be assigned as event staff.");
        }
        if (await db.EventAdminAssignments.AnyAsync(assignment =>
            assignment.EventId == eventId && assignment.UserId == user.Id))
        {
            return (false, "This user is already assigned to the event.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        user.Role = UserRole.EventAdmin;
        db.EventAdminAssignments.Add(new EventAdminAssignment
        {
            EventId = eventId,
            UserId = user.Id,
            AssignedByUserId = organizerId
        });
        audit.Add(AuditActionType.EventAdminAssigned, nameof(EventAdminAssignment), null, eventId, organizerId,
            $"Event administrator {user.Email} assigned.");
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return (true, null);
    }

    public async Task<bool> UnassignAsync(Guid eventId, Guid staffUserId, Guid organizerId, bool isPlatformAdmin)
    {
        if (!await db.Events.AnyAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == organizerId || isPlatformAdmin)))
        {
            return false;
        }

        var assignment = await db.EventAdminAssignments.SingleOrDefaultAsync(candidate =>
            candidate.EventId == eventId && candidate.UserId == staffUserId);
        if (assignment is null) return false;

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        db.EventAdminAssignments.Remove(assignment);
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Id == staffUserId);
        if (user is not null && user.Role == UserRole.EventAdmin &&
            !await db.EventAdminAssignments.AnyAsync(candidate => candidate.UserId == staffUserId && candidate.Id != assignment.Id))
        {
            user.Role = UserRole.Attendee;
        }

        audit.Add(AuditActionType.EventAdminAssigned, nameof(EventAdminAssignment), assignment.Id, eventId,
            organizerId, "Event administrator unassigned.");
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return true;
    }

    public async Task<TicketVerificationResponse> ValidateAsync(Guid ticketId, Guid userId, bool isPlatformAdmin)
    {
        var ticket = await LoadTicketAsync(ticketId);
        if (ticket is null) return Invalid("Ticket code was not found.");
        if (!await CanVerifyEventAsync(ticket.EventId, userId, isPlatformAdmin))
        {
            return Invalid("You are not assigned to this event.");
        }

        return await GetTicketStatusAsync(ticket);
    }

    public async Task<TicketVerificationResponse> ValidateByCodeAsync(
        string ticketCode, Guid userId, bool isPlatformAdmin)
    {
        if (!IsAdmissionCode(ticketCode))
        {
            return Invalid("This QR code is not an admission ticket.");
        }

        var ticket = await LoadTicketByCodeAsync(ticketCode);
        if (ticket is null) return Invalid("Ticket code was not found.");
        if (!await CanVerifyEventAsync(ticket.EventId, userId, isPlatformAdmin))
        {
            return Invalid("You are not assigned to this event.");
        }

        return await GetTicketStatusAsync(ticket);
    }

    public async Task<TicketVerificationResponse> CheckInAsync(
        string ticketCode, Guid userId, bool isPlatformAdmin)
    {
        if (!IsAdmissionCode(ticketCode))
        {
            return Invalid("This QR code is not an admission ticket.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var ticket = await LoadTicketByCodeAsync(ticketCode);
        if (ticket is null) return Invalid("Ticket code was not found.");
        if (!await CanVerifyEventAsync(ticket.EventId, userId, isPlatformAdmin))
        {
            return Invalid("You are not assigned to this event.");
        }

        var status = await GetTicketStatusAsync(ticket);
        if (status.Result != "Valid") return status;

        ticket.Status = TicketStatus.CheckedIn;
        var checkIn = new TicketCheckIn
        {
            TicketId = ticket.Id,
            EventId = ticket.EventId,
            CheckedInByUserId = userId,
            CheckedInAt = DateTimeOffset.UtcNow
        };
        db.TicketCheckIns.Add(checkIn);
        audit.Add(AuditActionType.TicketCheckedIn, nameof(Ticket), ticket.Id, ticket.EventId, userId,
            "Ticket checked in by authorized event staff.");

        try
        {
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (DbUpdateException exception) when (IsSerializationConflict(exception))
        {
            return new TicketVerificationResponse("AlreadyUsed", "Ticket was checked in by another staff member.", ticket.Id,
                ticket.Event.Title, ticket.OrderItem.TicketTypeName, ticket.AttendeeName, ticket.AttendeeEmail,
                TicketStatus.CheckedIn.ToString(), null);
        }

        return new TicketVerificationResponse("CheckedIn", "Ticket checked in successfully.", ticket.Id,
            ticket.Event.Title, ticket.OrderItem.TicketTypeName, ticket.AttendeeName, ticket.AttendeeEmail,
            ticket.Status.ToString(), checkIn.CheckedInAt);
    }

    public async Task<bool> ReverseCheckInAsync(Guid ticketId, Guid userId, bool isPlatformAdmin)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var ticket = await db.Tickets.Include(candidate => candidate.Event)
            .SingleOrDefaultAsync(candidate => candidate.Id == ticketId);
        if (ticket is null || !await CanVerifyEventAsync(ticket.EventId, userId, isPlatformAdmin) ||
            ticket.Status != TicketStatus.CheckedIn)
        {
            return false;
        }

        var checkIn = await db.TicketCheckIns
            .Where(candidate => candidate.TicketId == ticketId && candidate.ReversedAt == null)
            .OrderByDescending(candidate => candidate.CheckedInAt)
            .FirstOrDefaultAsync();
        if (checkIn is null) return false;

        checkIn.ReversedAt = DateTimeOffset.UtcNow;
        checkIn.ReversedByUserId = userId;
        ticket.Status = TicketStatus.Valid;
        audit.Add(AuditActionType.TicketCheckInReversed, nameof(Ticket), ticket.Id, ticket.EventId, userId,
            "Ticket check-in reversed by authorized event staff.");
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return true;
    }

    public async Task<IReadOnlyList<AttendeeResponse>?> SearchAttendeesAsync(
        Guid eventId, Guid userId, bool isPlatformAdmin, string? search)
    {
        if (!await CanVerifyEventAsync(eventId, userId, isPlatformAdmin)) return null;
        var query = db.Tickets.Where(ticket => ticket.EventId == eventId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(ticket =>
                ticket.AttendeeName.ToLower().Contains(term) || ticket.AttendeeEmail.ToLower().Contains(term));
        }

        var rows = await query.OrderBy(ticket => ticket.AttendeeName)
            .Select(ticket => new
            {
                ticket.Id,
                OrderId = ticket.OrderItem.OrderId,
                ticket.AttendeeName,
                ticket.AttendeeEmail,
                ticket.OrderItem.TicketTypeName,
                ticket.Status
            }).ToListAsync();
        return rows.Select(row => new AttendeeResponse(
            row.Id, row.OrderId, row.AttendeeName, row.AttendeeEmail,
            row.TicketTypeName, row.Status.ToString())).ToList();
    }

    public async Task<CheckInSummaryResponse?> GetSummaryAsync(
        Guid eventId, Guid userId, bool isPlatformAdmin)
    {
        if (!await CanVerifyEventAsync(eventId, userId, isPlatformAdmin)) return null;
        var grouped = await db.Tickets.Where(ticket => ticket.EventId == eventId)
            .GroupBy(ticket => ticket.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToListAsync();
        var registered = grouped.Where(row => row.Status is not (TicketStatus.Cancelled or TicketStatus.Refunded))
            .Sum(row => row.Count);
        var checkedIn = grouped.SingleOrDefault(row => row.Status == TicketStatus.CheckedIn)?.Count ?? 0;
        return new CheckInSummaryResponse(eventId, registered, checkedIn, registered - checkedIn,
            registered == 0 ? 0 : decimal.Round(checkedIn * 100m / registered, 2));
    }

    private Task<Ticket?> LoadTicketAsync(Guid ticketId) => db.Tickets
        .Include(ticket => ticket.Event)
        .Include(ticket => ticket.OrderItem)
        .SingleOrDefaultAsync(ticket => ticket.Id == ticketId);

    private Task<Ticket?> LoadTicketByCodeAsync(string code) => db.Tickets
        .Include(ticket => ticket.Event)
        .Include(ticket => ticket.OrderItem)
        .SingleOrDefaultAsync(ticket => ticket.Code == code.Trim());

    private static bool IsAdmissionCode(string code) =>
        code.StartsWith("TKT_", StringComparison.Ordinal) ||
        (code.Length == 43 && !code.StartsWith("CMP_", StringComparison.Ordinal));

    private async Task<bool> CanVerifyEventAsync(Guid eventId, Guid userId, bool isPlatformAdmin)
    {
        if (isPlatformAdmin) return true;
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null || user.IsSuspended) return false;
        return user.Role == UserRole.Organizer &&
                await db.Events.AnyAsync(ev => ev.Id == eventId && ev.OrganizerId == userId && !ev.IsCancelled) ||
            user.Role == UserRole.EventAdmin &&
                await db.EventAdminAssignments.AnyAsync(assignment =>
                    assignment.EventId == eventId && assignment.UserId == userId && !assignment.Event.IsCancelled);
    }

    private async Task<TicketVerificationResponse> GetTicketStatusAsync(Ticket ticket)
    {
        if (ticket.Event.IsCancelled)
        {
            return await DetailsAsync("Invalid", "The event has been cancelled.", ticket);
        }
        return ticket.Status switch
        {
            TicketStatus.Valid => await DetailsAsync("Valid", "Ticket is valid.", ticket),
            TicketStatus.CheckedIn => await DetailsAsync("AlreadyUsed", "Ticket has already been checked in.", ticket),
            TicketStatus.Cancelled => await DetailsAsync("Invalid", "Ticket has been cancelled.", ticket),
            TicketStatus.Refunded => await DetailsAsync("Invalid", "Ticket has been refunded.", ticket),
            _ => await DetailsAsync("Invalid", "Ticket status is not valid.", ticket)
        };
    }

    private async Task<TicketVerificationResponse> DetailsAsync(string result, string message, Ticket ticket)
    {
        var checkedInAt = ticket.Status == TicketStatus.CheckedIn
            ? await db.TicketCheckIns.Where(checkIn => checkIn.TicketId == ticket.Id && checkIn.ReversedAt == null)
                .Select(checkIn => (DateTimeOffset?)checkIn.CheckedInAt)
                .SingleOrDefaultAsync()
            : null;
        return new TicketVerificationResponse(result, message, ticket.Id, ticket.Event.Title,
            ticket.OrderItem.TicketTypeName, ticket.AttendeeName, ticket.AttendeeEmail,
            ticket.Status.ToString(), checkedInAt);
    }

    private static TicketVerificationResponse Invalid(string message) =>
        new("Invalid", message, null, null, null, null, null, null, null);

    private static bool IsSerializationConflict(Exception exception) =>
        exception is PostgresException { SqlState: PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.UniqueViolation } ||
        (exception.InnerException is not null && IsSerializationConflict(exception.InnerException));
}
