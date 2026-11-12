using System.Globalization;
using System.Text;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

/// <summary>Platform administration (SRS 4.12). Every state change is written to the audit log.</summary>
public sealed class AdminService(
    AuthDbContext db, AuditService audit, NotificationService notifications, PaidSalesService paidSales)
{
    private const int MaxRows = 200;

    public async Task<AdminOverviewResponse> GetOverviewAsync() => new(
        await db.Users.CountAsync(),
        await db.Users.CountAsync(user => user.IsSuspended),
        await db.Users.CountAsync(user => user.Role == UserRole.Organizer),
        await db.Events.CountAsync(),
        await db.Events.CountAsync(ev => ev.IsPublished && !ev.IsCancelled),
        await db.Events.CountAsync(ev => ev.IsSuspended),
        await db.EventReports.CountAsync(report => report.Status == EventReportStatus.Open),
        await db.SupportCases.CountAsync(supportCase => supportCase.IsEscalated && supportCase.Status != SupportCaseStatus.Resolved),
        await db.Orders.CountAsync(),
        await db.Payments.CountAsync(payment => payment.Status == PaymentStatus.Failed),
        await db.Refunds.CountAsync(),
        await db.Payments.Where(payment => payment.Status == PaymentStatus.Succeeded).SumAsync(payment => (decimal?)payment.Amount) ?? 0m,
        IsDemonstration: true);

    // ---- Users -------------------------------------------------------------------------------------------------

    public async Task<IReadOnlyList<AdminUserResponse>> SearchUsersAsync(string? search, string? role, bool? suspended)
    {
        var query = db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(user => EF.Functions.ILike(user.Email, term) || EF.Functions.ILike(user.FullName, term));
        }
        if (!string.IsNullOrWhiteSpace(role) && Enum.TryParse<UserRole>(role, true, out var parsedRole))
        {
            query = query.Where(user => user.Role == parsedRole);
        }
        if (suspended is not null) query = query.Where(user => user.IsSuspended == suspended);

        return await query.OrderByDescending(user => user.CreatedAt).Take(MaxRows)
            .Select(user => new AdminUserResponse(user.Id, user.Email, user.FullName, user.Role.ToString(),
                user.EmailConfirmed, user.IsSuspended, user.CreatedAt))
            .ToListAsync();
    }

    public async Task<(AdminUserResponse? User, string? Error, ServiceError Kind)> SetUserSuspendedAsync(
        Guid adminId, Guid userId, bool suspend, string? reason)
    {
        if (adminId == userId) return (null, "You cannot suspend or reinstate your own account.", ServiceError.BadRequest);
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null) return (null, "User not found.", ServiceError.NotFound);

        if (user.IsSuspended != suspend)
        {
            user.IsSuspended = suspend;
            audit.Add(suspend ? AuditActionType.UserSuspended : AuditActionType.UserReinstated, nameof(AppUser), user.Id, null,
                adminId, $"User {user.Email} {(suspend ? "suspended" : "reinstated")}{FormatReason(reason)}.");
            if (suspend)
            {
                // Suspension ends every session immediately; access tokens are rejected on their next request.
                await db.AuthTokens
                    .Where(token => token.UserId == userId && token.Type == AuthTokenType.RefreshToken && token.UsedAt == null)
                    .ExecuteUpdateAsync(set => set.SetProperty(token => token.UsedAt, (DateTimeOffset?)DateTimeOffset.UtcNow));
            }
            else
            {
                notifications.Notify(user.Id, "Account", "Account reinstated",
                    "Your BiletFlow account has been reinstated by a platform administrator.", email: user.Email);
            }

            await db.SaveChangesAsync();
        }

        return (ToUserResponse(user), null, ServiceError.None);
    }

    public async Task<(AdminUserResponse? User, string? Error, ServiceError Kind)> ChangeRoleAsync(
        Guid adminId, Guid userId, string role)
    {
        if (!Enum.TryParse<UserRole>(role, true, out var newRole) || !Enum.IsDefined(newRole) || newRole == UserRole.EventAdmin)
        {
            return (null, "Role must be Attendee, Organizer or PlatformAdmin. Event admins are assigned per event by organizers.", ServiceError.BadRequest);
        }
        if (adminId == userId) return (null, "You cannot change your own role.", ServiceError.BadRequest);

        var user = await db.Users.Include(candidate => candidate.OrganizerProfile)
            .SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null) return (null, "User not found.", ServiceError.NotFound);
        if (user.Role == UserRole.Organizer && newRole != UserRole.Organizer &&
            await db.Events.AnyAsync(ev => ev.OrganizerId == userId && !ev.IsCancelled))
        {
            return (null, "This organizer still manages events that are not cancelled.", ServiceError.Conflict);
        }

        if (user.Role != newRole)
        {
            var previous = user.Role;
            user.Role = newRole;
            if (newRole == UserRole.Organizer && user.OrganizerProfile is null)
            {
                var name = user.Email[..user.Email.IndexOf('@')];
                db.OrganizerProfiles.Add(new OrganizerProfile
                {
                    UserId = user.Id, BusinessName = name, DisplayName = name, ContactEmail = user.Email
                });
            }

            audit.Add(AuditActionType.UserRoleChanged, nameof(AppUser), user.Id, null, adminId,
                $"Role of {user.Email} changed from {previous} to {newRole}.");
            await db.SaveChangesAsync();
        }

        return (ToUserResponse(user), null, ServiceError.None);
    }

    // ---- Events ------------------------------------------------------------------------------------------------

    public async Task<IReadOnlyList<AdminEventResponse>> SearchEventsAsync(string? search, string? status)
    {
        var query = db.Events.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(ev => EF.Functions.ILike(ev.Title, term) || EF.Functions.ILike(ev.Organizer.Email, term) ||
                EF.Functions.ILike(ev.City, term));
        }

        switch (status?.Trim().ToLowerInvariant())
        {
            case "suspended": query = query.Where(ev => ev.IsSuspended); break;
            case "reported":
                query = query.Where(ev => db.EventReports.Any(report => report.EventId == ev.Id && report.Status == EventReportStatus.Open));
                break;
            case "cancelled": query = query.Where(ev => ev.IsCancelled); break;
            case "published": query = query.Where(ev => ev.IsPublished && !ev.IsCancelled); break;
        }

        var rows = await query.OrderByDescending(ev => ev.CreatedAt).Take(MaxRows)
            .Select(ev => new
            {
                Event = ev,
                OrganizerEmail = ev.Organizer.Email,
                OpenReports = db.EventReports.Count(report => report.EventId == ev.Id && report.Status == EventReportStatus.Open)
            })
            .ToListAsync();
        var now = DateTimeOffset.UtcNow;
        return rows.Select(row => new AdminEventResponse(row.Event.Id, row.Event.Title, row.Event.OrganizerId, row.OrganizerEmail,
            row.Event.StartDateUtc, row.Event.GetLifecycleStatus(now), row.Event.IsPublished, row.Event.IsSuspended,
            row.Event.Visibility.ToString(), row.Event.PaidSalesStatus.ToString(), row.Event.TicketsIssued, row.OpenReports)).ToList();
    }

    /// <summary>Suspends an event: it is hidden from attendees, all further sales stop and paid sales are suspended.</summary>
    public async Task<(bool Done, string? Error)> SetEventSuspendedAsync(Guid adminId, Guid eventId, bool suspend, string? reason)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return (false, "Event not found.");
        if (ev.IsSuspended == suspend) return (true, null);

        ev.IsSuspended = suspend;
        ev.UpdatedAt = DateTimeOffset.UtcNow;
        if (suspend && ev.PaidSalesStatus == PaidSalesStatus.Active)
        {
            ev.PaidSalesStatus = PaidSalesStatus.Suspended;
            audit.Add(AuditActionType.PaidSalesSuspended, nameof(Event), ev.Id, ev.Id, adminId,
                "Paid sales suspended together with the event.");
        }

        audit.Add(suspend ? AuditActionType.EventSuspended : AuditActionType.EventReinstated, nameof(Event), ev.Id, ev.Id, adminId,
            $"Event {(suspend ? "suspended" : "reinstated")} by a platform administrator{FormatReason(reason)}." +
            (suspend ? string.Empty : " Paid sales stay suspended until reinstated separately."));
        await notifications.NotifyUserAsync(ev.OrganizerId, "Moderation",
            $"Event {(suspend ? "suspended" : "reinstated")}: {ev.Title}",
            suspend
                ? $"A platform administrator suspended {ev.Title}{FormatReason(reason)}. It is hidden and cannot sell tickets. Contact platform support for details."
                : $"A platform administrator reinstated {ev.Title}.",
            ev.Id);
        await db.SaveChangesAsync();
        return (true, null);
    }

    public Task<bool> SuspendPaidSalesAsync(Guid adminId, Guid eventId, string? reason) => paidSales.SuspendAsync(adminId, eventId, reason);

    public Task<PaidSalesChecklistResponse?> ReinstatePaidSalesAsync(Guid adminId, Guid eventId) =>
        paidSales.ReinstateAsync(adminId, eventId);

    // ---- Reports -----------------------------------------------------------------------------------------------

    public async Task<(EventReportResponse? Report, string? Error, ServiceError Kind)> ReportEventAsync(
        Guid reporterId, Guid eventId, CreateEventReportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason)) return (null, "A reason is required.", ServiceError.BadRequest);
        var ev = await db.Events.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null || (!ev.IsPublished && ev.OrganizerId != reporterId)) return (null, "Event not found.", ServiceError.NotFound);
        if (await db.EventReports.AnyAsync(report =>
                report.EventId == eventId && report.ReporterUserId == reporterId && report.Status == EventReportStatus.Open))
        {
            return (null, "You already have an open report for this event.", ServiceError.Conflict);
        }

        var report = new EventReport
        {
            EventId = eventId,
            ReporterUserId = reporterId,
            Reason = request.Reason.Trim(),
            Details = string.IsNullOrWhiteSpace(request.Details) ? null : request.Details.Trim()
        };
        db.EventReports.Add(report);
        audit.Add(AuditActionType.EventReported, nameof(EventReport), report.Id, eventId, reporterId,
            $"Event reported for moderation: {report.Reason}.");
        await notifications.NotifyPlatformAdminsAsync("Moderation", "Event reported",
            $"{ev.Title} was reported: {report.Reason}.", eventId, exceptUserId: reporterId);
        await db.SaveChangesAsync();
        return (await GetReportAsync(report.Id), null, ServiceError.None);
    }

    public async Task<IReadOnlyList<EventReportResponse>> GetReportsAsync(string? status)
    {
        var query = db.EventReports.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<EventReportStatus>(status, true, out var parsed))
        {
            query = query.Where(report => report.Status == parsed);
        }

        return await ProjectReports(query.OrderByDescending(report => report.CreatedAt).Take(MaxRows)).ToListAsync();
    }

    public async Task<(EventReportResponse? Report, string? Error, ServiceError Kind)> ResolveReportAsync(
        Guid adminId, Guid reportId, ResolveEventReportRequest request)
    {
        if (!Enum.TryParse<EventReportStatus>(request.Status, true, out var status) || status == EventReportStatus.Open)
        {
            return (null, "Status must be Dismissed or ActionTaken.", ServiceError.BadRequest);
        }

        var report = await db.EventReports.SingleOrDefaultAsync(candidate => candidate.Id == reportId);
        if (report is null) return (null, "Report not found.", ServiceError.NotFound);
        if (report.Status != EventReportStatus.Open) return (null, "This report is already resolved.", ServiceError.Conflict);

        report.Status = status;
        report.ResolvedByUserId = adminId;
        report.ResolvedAt = DateTimeOffset.UtcNow;
        report.ResolutionNote = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        audit.Add(AuditActionType.EventReportResolved, nameof(EventReport), report.Id, report.EventId, adminId,
            $"Event report resolved as {status}{FormatReason(report.ResolutionNote)}.");
        await db.SaveChangesAsync();

        if (request.SuspendEvent) await SetEventSuspendedAsync(adminId, report.EventId, true, report.Reason);
        return (await GetReportAsync(report.Id), null, ServiceError.None);
    }

    // ---- Orders, payments, refunds, activations, campaigns, support ---------------------------------------------

    public async Task<IReadOnlyList<AdminOrderResponse>> SearchOrdersAsync(string? search, string? status, Guid? eventId)
    {
        var query = db.Orders.AsNoTracking();
        if (eventId is not null) query = query.Where(order => order.EventId == eventId);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<OrderStatus>(status, true, out var parsed))
        {
            query = query.Where(order => order.Status == parsed);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var trimmed = search.Trim();
            if (Guid.TryParse(trimmed, out var orderId))
            {
                query = query.Where(order => order.Id == orderId);
            }
            else
            {
                var term = $"%{trimmed}%";
                query = query.Where(order => EF.Functions.ILike(order.AttendeeEmail, term) ||
                    EF.Functions.ILike(order.AttendeeName, term) || EF.Functions.ILike(order.Event.Title, term));
            }
        }

        return await query.OrderByDescending(order => order.CreatedAt).Take(MaxRows)
            .Select(order => new AdminOrderResponse(order.Id, order.EventId, order.Event.Title, order.AttendeeId,
                order.AttendeeEmail, order.Status.ToString(), order.Total, order.DiscountTotal, order.FeeTotal,
                order.PromoCode, order.CreatedAt, order.ConfirmedAt))
            .ToListAsync();
    }

    public async Task<IReadOnlyList<AdminPaymentResponse>> GetPaymentsAsync(string? status, string? search)
    {
        var query = db.Payments.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<PaymentStatus>(status, true, out var parsed))
        {
            query = query.Where(payment => payment.Status == parsed);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(payment => EF.Functions.ILike(payment.Order.AttendeeEmail, term) ||
                EF.Functions.ILike(payment.Order.Event.Title, term));
        }

        return await query.OrderByDescending(payment => payment.CreatedAt).Take(MaxRows)
            .Select(payment => new AdminPaymentResponse(payment.Id, payment.OrderId, payment.Order.EventId,
                payment.Order.Event.Title, payment.Order.AttendeeEmail, payment.Amount, payment.Status.ToString(),
                payment.IsSimulated, payment.CreatedAt))
            .ToListAsync();
    }

    public async Task<IReadOnlyList<RefundResponse>> GetRefundsAsync() =>
        await db.Refunds.AsNoTracking().OrderByDescending(refund => refund.CreatedAt).Take(MaxRows)
            .Select(refund => new RefundResponse(refund.Id, refund.OrderId, refund.EventId, refund.Amount, refund.Reason,
                refund.InitiatedByUserId, refund.IsSimulated, refund.CreatedAt))
            .ToListAsync();

    public async Task<IReadOnlyList<AdminActivationResponse>> GetActivationsAsync()
    {
        var rows = await db.PaidSalesActivations.AsNoTracking()
            .OrderByDescending(activation => activation.CreatedAt).Take(MaxRows)
            .Select(activation => new
            {
                activation,
                activation.Event.Title,
                activation.Event.PaidSalesStatus,
                OrganizerEmail = db.Users.Where(user => user.Id == activation.OrganizerId).Select(user => user.Email).First(),
                Verified = db.OrganizerProfiles.Any(profile => profile.UserId == activation.OrganizerId && profile.IsVerified)
            })
            .ToListAsync();
        return rows.Select(row => new AdminActivationResponse(row.activation.Id, row.activation.EventId, row.Title,
            row.activation.OrganizerId, row.OrganizerEmail, row.Verified, row.PaidSalesStatus.ToString(),
            row.activation.FeeAmount, row.activation.FeePaidAt, row.activation.TermsAcceptedAt, row.activation.ActivatedAt,
            row.activation.IsSimulated)).ToList();
    }

    public async Task<IReadOnlyList<AdminPromoActivityResponse>> GetPromoActivityAsync() =>
        await db.PromoCampaigns.AsNoTracking().OrderByDescending(campaign => campaign.CreatedAt).Take(MaxRows)
            .Select(campaign => new AdminPromoActivityResponse(campaign.Id, campaign.EventId, campaign.Event.Title, campaign.Code,
                campaign.IsEnabled, campaign.MaxRedemptions,
                campaign.Orders.Count(order => order.Status == OrderStatus.Confirmed),
                campaign.LinkVisits,
                campaign.Orders.Where(order => order.Status == OrderStatus.Confirmed).Sum(order => (decimal?)order.DiscountTotal) ?? 0m,
                campaign.CreatedAt))
            .ToListAsync();

    // ---- CSV export ----------------------------------------------------------------------------------------------

    public static readonly string[] ExportTypes = ["users", "events", "orders", "payments", "refunds"];

    public async Task<string?> ExportCsvAsync(string type)
    {
        var builder = new StringBuilder();
        switch (type.Trim().ToLowerInvariant())
        {
            case "users":
                builder.AppendLine("Id,Email,FullName,Role,EmailConfirmed,IsSuspended,CreatedAt");
                foreach (var user in await db.Users.AsNoTracking().OrderBy(user => user.CreatedAt).ToListAsync())
                {
                    AppendRow(builder, user.Id, user.Email, user.FullName, user.Role, user.EmailConfirmed, user.IsSuspended, user.CreatedAt);
                }
                break;
            case "events":
                builder.AppendLine("Id,Title,OrganizerEmail,City,StartDateUtc,Lifecycle,IsPublished,IsSuspended,PaidSalesStatus,TicketsIssued,Capacity");
                var now = DateTimeOffset.UtcNow;
                foreach (var row in await db.Events.AsNoTracking().OrderBy(ev => ev.StartDateUtc)
                             .Select(ev => new { ev, ev.Organizer.Email }).ToListAsync())
                {
                    AppendRow(builder, row.ev.Id, row.ev.Title, row.Email, row.ev.City, row.ev.StartDateUtc, row.ev.GetLifecycleStatus(now),
                        row.ev.IsPublished, row.ev.IsSuspended, row.ev.PaidSalesStatus, row.ev.TicketsIssued, row.ev.Capacity);
                }
                break;
            case "orders":
                builder.AppendLine("Id,EventId,EventTitle,AttendeeEmail,Status,TotalKzt,DiscountKzt,ProcessingFeeKzt,PromoCode,CreatedAt,ConfirmedAt,Simulated");
                foreach (var row in await db.Orders.AsNoTracking().OrderBy(order => order.CreatedAt)
                             .Select(order => new { order, order.Event.Title }).ToListAsync())
                {
                    AppendRow(builder, row.order.Id, row.order.EventId, row.Title, row.order.AttendeeEmail, row.order.Status,
                        row.order.Total, row.order.DiscountTotal, row.order.FeeTotal, row.order.PromoCode, row.order.CreatedAt,
                        row.order.ConfirmedAt, true);
                }
                break;
            case "payments":
                builder.AppendLine("Id,OrderId,EventTitle,AttendeeEmail,AmountKzt,Status,Simulated,CreatedAt");
                foreach (var row in await db.Payments.AsNoTracking().OrderBy(payment => payment.CreatedAt)
                             .Select(payment => new { payment, payment.Order.Event.Title, payment.Order.AttendeeEmail }).ToListAsync())
                {
                    AppendRow(builder, row.payment.Id, row.payment.OrderId, row.Title, row.AttendeeEmail, row.payment.Amount,
                        row.payment.Status, row.payment.IsSimulated, row.payment.CreatedAt);
                }
                break;
            case "refunds":
                builder.AppendLine("Id,OrderId,EventId,AmountKzt,Reason,InitiatedByUserId,Simulated,CreatedAt");
                foreach (var refund in await db.Refunds.AsNoTracking().OrderBy(refund => refund.CreatedAt).ToListAsync())
                {
                    AppendRow(builder, refund.Id, refund.OrderId, refund.EventId, refund.Amount, refund.Reason,
                        refund.InitiatedByUserId, refund.IsSimulated, refund.CreatedAt);
                }
                break;
            default:
                return null;
        }

        return builder.ToString();
    }

    private async Task<EventReportResponse> GetReportAsync(Guid reportId) =>
        await ProjectReports(db.EventReports.AsNoTracking().Where(report => report.Id == reportId)).SingleAsync();

    private static IQueryable<EventReportResponse> ProjectReports(IQueryable<EventReport> query) =>
        query.Select(report => new EventReportResponse(report.Id, report.EventId, report.Event.Title, report.ReporterUserId,
            report.Reporter.Email, report.Reason, report.Details, report.Status.ToString(), report.ResolutionNote,
            report.CreatedAt, report.ResolvedAt));

    private static AdminUserResponse ToUserResponse(AppUser user) => new(user.Id, user.Email, user.FullName, user.Role.ToString(),
        user.EmailConfirmed, user.IsSuspended, user.CreatedAt);

    private static string FormatReason(string? reason) =>
        string.IsNullOrWhiteSpace(reason) ? string.Empty : $" (reason: {reason.Trim()})";

    private static void AppendRow(StringBuilder builder, params object?[] values)
    {
        builder.AppendLine(string.Join(',', values.Select(value => value switch
        {
            null => string.Empty,
            DateTimeOffset date => date.ToString("O", CultureInfo.InvariantCulture),
            decimal number => number.ToString("0.00", CultureInfo.InvariantCulture),
            bool flag => flag ? "true" : "false",
            _ => Quote(Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty)
        })));
    }

    /// <summary>Quotes a CSV field and neutralizes spreadsheet formulas (CSV injection).</summary>
    private static string Quote(string value)
    {
        if (value.Length > 0 && value[0] is '=' or '+' or '-' or '@' or '\t' or '\r') value = "'" + value;
        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }
}
