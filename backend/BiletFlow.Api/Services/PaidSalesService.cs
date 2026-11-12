using System.Data;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

/// <summary>
/// Paid Sales Activation (SRS 3.2, 4.5). Every step — identity/payout verification, the activation-fee payment and the
/// payout account — is a clearly labelled simulation: no identity check is made and no money moves.
/// </summary>
public sealed class PaidSalesService(
    AuthDbContext db, AuditService audit, PlatformSettingsService platformSettings, NotificationService notifications)
{
    public async Task<PaidSalesChecklistResponse?> GetChecklistAsync(Guid eventId, Guid userId, bool isPlatformAdmin)
    {
        var ev = await GetManagedEventAsync(eventId, userId, isPlatformAdmin);
        return ev is null ? null : await BuildChecklistAsync(ev);
    }

    /// <summary>Simulated identity and payout verification of the organizer; requires a sandbox payout account.</summary>
    public async Task<(bool Verified, string? Error)> VerifyOrganizerSimulationAsync(Guid userId)
    {
        var profile = await db.OrganizerProfiles.SingleOrDefaultAsync(candidate => candidate.UserId == userId);
        if (profile is null) return (false, "Create an organizer profile first.");
        if (!HasPayoutAccount(profile))
        {
            return (false, "Add a sandbox payout provider and reference to your organizer profile first.");
        }

        if (profile.IsVerified) return (true, null);
        profile.IsVerified = true;
        profile.UpdatedAt = DateTimeOffset.UtcNow;
        audit.Add(AuditActionType.OrganizerVerified, nameof(OrganizerProfile), profile.Id, null, userId,
            "Organizer identity and payout verification completed (simulation).");
        await db.SaveChangesAsync();
        return (true, null);
    }

    /// <summary>Records the simulated payment of the event's one-time activation fee.</summary>
    public async Task<(PaidSalesChecklistResponse? Checklist, string? Error, ServiceError Kind)> PayActivationFeeAsync(
        Guid eventId, Guid userId, bool isPlatformAdmin)
    {
        var ev = await GetManagedEventAsync(eventId, userId, isPlatformAdmin);
        if (ev is null) return (null, "Event not found.", ServiceError.NotFound);
        if (ev.IsCancelled) return (null, "A cancelled event cannot activate paid sales.", ServiceError.BadRequest);
        if (!await HasPaidTicketTypeAsync(eventId)) return (null, "Create at least one paid ticket type first.", ServiceError.BadRequest);

        var activation = await GetOrCreateActivationAsync(ev);
        RecordFee(activation, ev, userId, (await platformSettings.GetAsync()).ActivationFeeKzt);
        await db.SaveChangesAsync();
        return (await BuildChecklistAsync(ev), null, ServiceError.None);
    }

    /// <summary>
    /// Activates paid sales after completing any open checklist step in simulation (verification, fee, terms).
    /// The organizer must have a paid ticket type and a sandbox payout account. Only a platform admin can lift a suspension.
    /// </summary>
    public async Task<(PaidSalesChecklistResponse? Checklist, string? Error, ServiceError Kind)> ActivateAsync(
        Guid eventId, Guid userId, bool isPlatformAdmin, ActivatePaidSalesSimulationRequest request)
    {
        if (!request.ConfirmSimulationOnly) return (null, "Confirm that this is a simulation only.", ServiceError.BadRequest);
        if (!request.AcceptTerms) return (null, "The paid-event terms must be accepted.", ServiceError.BadRequest);

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var ev = await GetManagedEventAsync(eventId, userId, isPlatformAdmin);
        if (ev is null) return (null, "Event not found.", ServiceError.NotFound);
        if (ev.IsCancelled) return (null, "A cancelled event cannot activate paid sales.", ServiceError.BadRequest);
        if (ev.IsSuspended && !isPlatformAdmin) return (null, "This event is suspended by the platform.", ServiceError.BadRequest);
        if (ev.PaidSalesStatus == PaidSalesStatus.Suspended && !isPlatformAdmin)
        {
            return (null, "Paid sales were suspended by a platform administrator and can only be reinstated by one.", ServiceError.BadRequest);
        }
        if (!await HasPaidTicketTypeAsync(eventId)) return (null, "Create at least one paid ticket type first.", ServiceError.BadRequest);

        var now = DateTimeOffset.UtcNow;
        var profile = await db.OrganizerProfiles.SingleOrDefaultAsync(candidate => candidate.UserId == ev.OrganizerId);
        if (profile is null)
        {
            var organizer = await db.Users.SingleAsync(user => user.Id == ev.OrganizerId);
            var name = organizer.Email[..organizer.Email.IndexOf('@')];
            profile = new OrganizerProfile { UserId = organizer.Id, BusinessName = name, DisplayName = name, ContactEmail = organizer.Email };
            db.OrganizerProfiles.Add(profile);
        }

        if (!HasPayoutAccount(profile))
        {
            // One-step simulation: register a clearly labelled sandbox payout account instead of a real one.
            profile.SandboxPayoutProvider = "BiletFlow Sandbox (simulation)";
            profile.SandboxPayoutReference = $"SANDBOX-{ev.OrganizerId.ToString("N")[..12].ToUpperInvariant()}";
            profile.UpdatedAt = now;
        }

        if (!profile.IsVerified)
        {
            profile.IsVerified = true;
            profile.UpdatedAt = now;
            audit.Add(AuditActionType.OrganizerVerified, nameof(OrganizerProfile), profile.Id, ev.Id, userId,
                "Organizer identity and payout verification completed (simulation).");
        }

        var activation = await GetOrCreateActivationAsync(ev);
        RecordFee(activation, ev, userId, (await platformSettings.GetAsync()).ActivationFeeKzt);
        if (activation.TermsAcceptedAt is null)
        {
            activation.TermsAcceptedAt = now;
            audit.Add(AuditActionType.PaidSalesTermsAccepted, nameof(PaidSalesActivation), activation.Id, ev.Id, userId,
                "Paid-event terms accepted.");
        }

        var wasActive = ev.PaidSalesStatus == PaidSalesStatus.Active;
        ev.PaidTermsAccepted = true;
        ev.PaidSalesStatus = PaidSalesStatus.Active;
        ev.UpdatedAt = now;
        activation.ActivatedAt ??= now;
        if (!wasActive)
        {
            audit.Add(AuditActionType.PaidSalesActivated, nameof(Event), ev.Id, ev.Id, userId, "Paid sales activated (simulation).");
            notifications.Notify(ev.OrganizerId, "PaidSales", $"Paid sales active: {ev.Title}",
                $"Paid ticket sales are now active for {ev.Title}. Payouts are simulated; estimated payouts are shown in your event analytics.",
                ev.Id, email: profile.ContactEmail);
        }

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return (await BuildChecklistAsync(ev), null, ServiceError.None);
    }

    public async Task<bool> SuspendAsync(Guid adminId, Guid eventId, string? reason)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return false;

        ev.PaidSalesStatus = PaidSalesStatus.Suspended;
        ev.UpdatedAt = DateTimeOffset.UtcNow;
        audit.Add(AuditActionType.PaidSalesSuspended, nameof(Event), ev.Id, ev.Id, adminId,
            $"Paid sales suspended by a platform administrator{FormatReason(reason)}.");
        await notifications.NotifyUserAsync(ev.OrganizerId, "PaidSales", $"Paid sales suspended: {ev.Title}",
            $"A platform administrator suspended paid ticket sales for {ev.Title}{FormatReason(reason)}. Contact platform support for details.",
            ev.Id);
        await db.SaveChangesAsync();
        return true;
    }

    /// <summary>Lifts a paid-sales suspension. Sales become active again only if activation was completed earlier.</summary>
    public async Task<PaidSalesChecklistResponse?> ReinstateAsync(Guid adminId, Guid eventId)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return null;

        var activation = await db.PaidSalesActivations.SingleOrDefaultAsync(row => row.EventId == eventId);
        ev.PaidSalesStatus = activation?.ActivatedAt is not null ? PaidSalesStatus.Active : PaidSalesStatus.None;
        ev.UpdatedAt = DateTimeOffset.UtcNow;
        audit.Add(AuditActionType.PaidSalesReinstated, nameof(Event), ev.Id, ev.Id, adminId,
            $"Paid-sales suspension lifted; status is now {ev.PaidSalesStatus}.");
        await notifications.NotifyUserAsync(ev.OrganizerId, "PaidSales", $"Paid sales reinstated: {ev.Title}",
            $"A platform administrator lifted the paid-sales suspension for {ev.Title}.", ev.Id);
        await db.SaveChangesAsync();
        return await BuildChecklistAsync(ev);
    }

    private async Task<PaidSalesChecklistResponse> BuildChecklistAsync(Event ev)
    {
        var profile = await db.OrganizerProfiles.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.UserId == ev.OrganizerId);
        var activation = await db.PaidSalesActivations.AsNoTracking().SingleOrDefaultAsync(row => row.EventId == ev.Id);
        var settings = await platformSettings.GetAsync();
        var hasPaidType = await HasPaidTicketTypeAsync(ev.Id);
        var payout = profile is not null && HasPayoutAccount(profile);
        var items = new List<PaidSalesChecklistItem>
        {
            new("paidTicketType", "Create at least one paid ticket type", hasPaidType),
            new("identityVerification", "Complete identity and payout verification (simulation)", profile?.IsVerified == true),
            new("activationFee", $"Pay the {settings.ActivationFeeKzt:0.##} KZT activation fee (simulation)", activation?.FeePaidAt is not null),
            new("payoutAccount", "Connect a sandbox payout account", payout),
            new("terms", "Accept the paid-event terms", activation?.TermsAcceptedAt is not null)
        };
        // The remaining steps are completed in simulation by the activation call itself.
        var canActivate = hasPaidType && !ev.IsCancelled && !ev.IsSuspended &&
            ev.PaidSalesStatus != PaidSalesStatus.Suspended;
        return new PaidSalesChecklistResponse(ev.Id, ev.PaidSalesStatus.ToString(), IsSimulation: true,
            activation?.FeeAmount ?? settings.ActivationFeeKzt, canActivate, items,
            activation?.FeePaidAt, activation?.TermsAcceptedAt, activation?.ActivatedAt);
    }

    private async Task<PaidSalesActivation> GetOrCreateActivationAsync(Event ev)
    {
        var activation = await db.PaidSalesActivations.SingleOrDefaultAsync(row => row.EventId == ev.Id);
        if (activation is not null) return activation;

        activation = new PaidSalesActivation { EventId = ev.Id, OrganizerId = ev.OrganizerId };
        db.PaidSalesActivations.Add(activation);
        if (ev.PaidSalesStatus == PaidSalesStatus.None) ev.PaidSalesStatus = PaidSalesStatus.Pending;
        return activation;
    }

    private void RecordFee(PaidSalesActivation activation, Event ev, Guid userId, decimal fee)
    {
        if (activation.FeePaidAt is not null) return;
        activation.FeeAmount = fee;
        activation.FeePaidAt = DateTimeOffset.UtcNow;
        activation.IsSimulated = true;
        audit.Add(AuditActionType.ActivationFeePaid, nameof(PaidSalesActivation), activation.Id, ev.Id, userId,
            $"Paid Sales Activation Fee of {fee:0.00} KZT recorded (simulation; no money moved).");
    }

    private Task<bool> HasPaidTicketTypeAsync(Guid eventId) =>
        db.TicketTypes.AnyAsync(ticketType => ticketType.EventId == eventId && ticketType.Price > 0);

    private static bool HasPayoutAccount(OrganizerProfile profile) =>
        !string.IsNullOrWhiteSpace(profile.SandboxPayoutProvider) && !string.IsNullOrWhiteSpace(profile.SandboxPayoutReference);

    private Task<Event?> GetManagedEventAsync(Guid eventId, Guid userId, bool isPlatformAdmin) =>
        db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId && (candidate.OrganizerId == userId || isPlatformAdmin));

    private static string FormatReason(string? reason) =>
        string.IsNullOrWhiteSpace(reason) ? string.Empty : $" (reason: {reason.Trim()})";
}
