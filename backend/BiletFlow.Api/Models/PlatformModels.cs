using System.Text.Json.Serialization;

namespace BiletFlow.Api.Models;

public enum EventReportStatus { Open, Dismissed, ActionTaken }

/// <summary>A full refund of a confirmed paid order (SRS 4.9). In the academic MVP every refund is simulated.</summary>
public sealed class Refund
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderId { get; set; }
    [JsonIgnore]
    public Order Order { get; set; } = null!;
    public Guid EventId { get; set; }
    public decimal Amount { get; set; }
    public string? Reason { get; set; }
    public Guid? InitiatedByUserId { get; set; }
    public bool IsSimulated { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Paid-sales activation record of one event (SRS 3.2, 4.5): the activation fee payment and accepted terms.
/// The fee payment is simulated; no money moves.
/// </summary>
public sealed class PaidSalesActivation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    [JsonIgnore]
    public Event Event { get; set; } = null!;
    public Guid OrganizerId { get; set; }
    public decimal FeeAmount { get; set; }
    public DateTimeOffset? FeePaidAt { get; set; }
    public DateTimeOffset? TermsAcceptedAt { get; set; }
    public DateTimeOffset? ActivatedAt { get; set; }
    public bool IsSimulated { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Platform-wide settings managed by platform administrators. Only one row (Id = 1) exists.</summary>
public sealed class PlatformSettings
{
    public const int SingletonId = 1;
    public int Id { get; set; } = SingletonId;
    /// <summary>One-time Paid Sales Activation Fee per event, in KZT.</summary>
    public decimal ActivationFeeKzt { get; set; } = 5000m;
    /// <summary>Simulated payment-processing charge deducted from each paid order, as a percentage.</summary>
    public decimal ProcessingFeePercent { get; set; } = 2.5m;
    /// <summary>Fixed simulated processing charge per paid order, in KZT.</summary>
    public decimal ProcessingFeeFixedKzt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? UpdatedByUserId { get; set; }
}

/// <summary>A report of a problematic event submitted by a user for platform moderation (SRS 4.12).</summary>
public sealed class EventReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    [JsonIgnore]
    public Event Event { get; set; } = null!;
    public Guid ReporterUserId { get; set; }
    [JsonIgnore]
    public AppUser Reporter { get; set; } = null!;
    public required string Reason { get; set; }
    public string? Details { get; set; }
    public EventReportStatus Status { get; set; } = EventReportStatus.Open;
    public Guid? ResolvedByUserId { get; set; }
    public string? ResolutionNote { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ResolvedAt { get; set; }
}
