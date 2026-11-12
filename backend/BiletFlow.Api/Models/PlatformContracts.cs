using System.ComponentModel.DataAnnotations;

namespace BiletFlow.Api.Models;

// ---- Refunds -------------------------------------------------------------------------------------------------

public sealed record RefundOrderRequest
{
    [MaxLength(500)]
    public string? Reason { get; init; }
}

public sealed record RefundResponse(
    Guid Id, Guid OrderId, Guid EventId, decimal Amount, string? Reason, Guid? InitiatedByUserId,
    bool IsSimulated, DateTimeOffset CreatedAt);

// ---- Promo quote ---------------------------------------------------------------------------------------------

public sealed record CheckoutQuoteRequest
{
    public Guid EventId { get; init; }
    [MaxLength(10)]
    public IReadOnlyList<CheckoutItemRequest> Items { get; init; } = [];
    [MaxLength(10)]
    public IReadOnlyList<Guid>? SeatIds { get; init; }
    [MaxLength(40)]
    public string? PromoCode { get; init; }
    [MaxLength(64)]
    public string? CampaignToken { get; init; }
}

public sealed record CheckoutQuoteResponse(
    Guid EventId, decimal Subtotal, decimal DiscountTotal, decimal Total, string Currency,
    string? PromoCode, string? PromoError, bool IsSimulated);

// ---- Paid-sales activation -----------------------------------------------------------------------------------

public sealed record PaidSalesChecklistItem(string Key, string Label, bool Completed);

public sealed record PaidSalesChecklistResponse(
    Guid EventId, string PaidSalesStatus, bool IsSimulation, decimal ActivationFeeKzt, bool CanActivate,
    IReadOnlyList<PaidSalesChecklistItem> Items, DateTimeOffset? FeePaidAt, DateTimeOffset? TermsAcceptedAt,
    DateTimeOffset? ActivatedAt);

// ---- Seating -------------------------------------------------------------------------------------------------

public sealed record VenueSectionSummary(Guid Id, string Name, int SeatCount, int AccessibleSeatCount, IReadOnlyList<string> Rows);
public sealed record VenueResponse(Guid Id, string Name, string Address, int SeatCount, IReadOnlyList<VenueSectionSummary> Sections);

public sealed record SeatingSectionAssignment
{
    public Guid SectionId { get; init; }
    public Guid TicketTypeId { get; init; }
}

public sealed record ConfigureSeatingRequest
{
    /// <summary>"General" or "Assigned".</summary>
    [Required]
    public required string SeatingMode { get; init; }
    public Guid? VenueId { get; init; }
    public IReadOnlyList<SeatingSectionAssignment> Sections { get; init; } = [];
}

public sealed record SeatMapSeat(
    Guid SeatId, string RowLabel, string Number, bool IsAccessible, string Status, string Label);

public sealed record SeatMapSection(
    Guid SectionId, string Name, Guid? TicketTypeId, string? TicketTypeName, decimal? Price,
    IReadOnlyList<SeatMapSeat> Seats);

/// <summary>
/// Seat statuses: Available, Held (temporarily held by a checkout), Sold, Unavailable (section not on sale).
/// "Selected" is a client-side state. <c>IsAccessible</c> marks accessible seats independently of status.
/// </summary>
public sealed record SeatMapResponse(
    Guid EventId, string SeatingMode, Guid? VenueId, string? VenueName, int HoldMinutes,
    IReadOnlyList<SeatMapSection> Sections, IReadOnlyDictionary<string, string> Legend);

// ---- Analytics -----------------------------------------------------------------------------------------------

public sealed record CapacityMetrics(int TotalCapacity, int TicketsSold, int TicketsReserved, int TicketsRemaining, decimal PercentSold);

public sealed record RevenueMetrics(
    string Currency, decimal GrossSales, decimal Discounts, decimal Refunds, decimal ProcessingFees,
    decimal NetRevenue, decimal EstimatedPayout, int ConfirmedOrders, int RefundedOrders, bool IsDemonstration);

public sealed record SalesOverTimePoint(DateOnly Date, int TicketsSold, decimal NetRevenue);

public sealed record TicketTypeSalesRow(
    Guid TicketTypeId, string Name, decimal Price, int Quantity, int Sold, int Reserved, int Refunded,
    int CheckedIn, decimal GrossSales, decimal Discounts, decimal NetRevenue);

public sealed record CampaignSalesRow(
    Guid CampaignId, string Code, bool IsEnabled, int LinkVisits, int Redemptions, int TicketsSold,
    decimal GrossRevenue, decimal DiscountTotal, decimal NetRevenue);

public sealed record AttendanceMetrics(int Registered, int CheckedIn, int Absent, decimal CheckInPercentage);

public sealed record EventAnalyticsResponse(
    Guid EventId, string EventTitle, string LifecycleStatus, DateTimeOffset? From, DateTimeOffset? To, Guid? TicketTypeId,
    CapacityMetrics Capacity, RevenueMetrics Revenue, IReadOnlyList<SalesOverTimePoint> SalesOverTime,
    IReadOnlyList<TicketTypeSalesRow> TicketTypes, IReadOnlyList<CampaignSalesRow> Campaigns, AttendanceMetrics Attendance);

public sealed record OrganizerEventSummary(
    Guid EventId, string Title, DateTimeOffset StartDateUtc, string LifecycleStatus, bool IsPublished,
    string PaidSalesStatus, int TicketsSold, int TotalCapacity, decimal NetRevenue, int CheckedIn);

public sealed record OrganizerDashboardResponse(
    int EventCount, int Upcoming, int Active, int Completed, int Cancelled, int TicketsSold,
    decimal GrossSales, decimal NetRevenue, decimal EstimatedPayout, string Currency, bool IsDemonstration,
    IReadOnlyList<OrganizerEventSummary> Events);

// ---- History -------------------------------------------------------------------------------------------------

public sealed record EventHistoryEntry(
    Guid Id, DateTimeOffset CreatedAt, Guid? ActorUserId, string? ActorEmail, string ActionType,
    string EntityType, Guid? EntityId, string Description);

// ---- Calendar ------------------------------------------------------------------------------------------------

public sealed record CalendarLinksResponse(
    Guid EventId, string IcsUrl, string GoogleCalendarUrl, string OutlookCalendarUrl, string Timezone, bool IsCancelled);

// ---- Reports & administration ---------------------------------------------------------------------------------

public sealed record CreateEventReportRequest
{
    [Required, MaxLength(120)]
    public required string Reason { get; init; }
    [MaxLength(2000)]
    public string? Details { get; init; }
}

public sealed record ResolveEventReportRequest
{
    /// <summary>"Dismissed" or "ActionTaken".</summary>
    [Required]
    public required string Status { get; init; }
    [MaxLength(1000)]
    public string? Note { get; init; }
    /// <summary>When true, the reported event is suspended as part of resolving the report.</summary>
    public bool SuspendEvent { get; init; }
}

public sealed record EventReportResponse(
    Guid Id, Guid EventId, string EventTitle, Guid ReporterUserId, string ReporterEmail, string Reason, string? Details,
    string Status, string? ResolutionNote, DateTimeOffset CreatedAt, DateTimeOffset? ResolvedAt);

public sealed record AdminReasonRequest
{
    [MaxLength(500)]
    public string? Reason { get; init; }
}

public sealed record ChangeUserRoleRequest
{
    /// <summary>Attendee, Organizer or PlatformAdmin. EventAdmin is granted through event staff assignment.</summary>
    [Required]
    public required string Role { get; init; }
}

public sealed record UpdatePlatformSettingsRequest
{
    [Range(typeof(decimal), "0", "10000000", ParseLimitsInInvariantCulture = true)]
    public decimal ActivationFeeKzt { get; init; }
    [Range(typeof(decimal), "0", "50", ParseLimitsInInvariantCulture = true)]
    public decimal ProcessingFeePercent { get; init; }
    [Range(typeof(decimal), "0", "1000000", ParseLimitsInInvariantCulture = true)]
    public decimal ProcessingFeeFixedKzt { get; init; }
}

public sealed record PlatformSettingsResponse(
    decimal ActivationFeeKzt, decimal ProcessingFeePercent, decimal ProcessingFeeFixedKzt, string Currency,
    DateTimeOffset UpdatedAt);

public sealed record AdminOverviewResponse(
    int Users, int SuspendedUsers, int Organizers, int Events, int PublishedEvents, int SuspendedEvents,
    int OpenReports, int EscalatedSupportCases, int Orders, int FailedPayments, int Refunds,
    decimal SimulatedGrossVolume, bool IsDemonstration);

public sealed record AdminUserResponse(
    Guid Id, string Email, string FullName, string Role, bool EmailConfirmed, bool IsSuspended, DateTimeOffset CreatedAt);

public sealed record AdminEventResponse(
    Guid Id, string Title, Guid OrganizerId, string OrganizerEmail, DateTimeOffset StartDateUtc, string LifecycleStatus,
    bool IsPublished, bool IsSuspended, string Visibility, string PaidSalesStatus, int TicketsIssued, int OpenReports);

public sealed record AdminOrderResponse(
    Guid Id, Guid EventId, string EventTitle, Guid AttendeeId, string AttendeeEmail, string Status, decimal Total,
    decimal DiscountTotal, decimal FeeTotal, string? PromoCode, DateTimeOffset CreatedAt, DateTimeOffset? ConfirmedAt);

public sealed record AdminPaymentResponse(
    Guid Id, Guid OrderId, Guid EventId, string EventTitle, string AttendeeEmail, decimal Amount, string Status,
    bool IsSimulated, DateTimeOffset CreatedAt);

public sealed record AdminActivationResponse(
    Guid Id, Guid EventId, string EventTitle, Guid OrganizerId, string OrganizerEmail, bool OrganizerVerified,
    string PaidSalesStatus, decimal FeeAmount, DateTimeOffset? FeePaidAt, DateTimeOffset? TermsAcceptedAt,
    DateTimeOffset? ActivatedAt, bool IsSimulated);

public sealed record AdminPromoActivityResponse(
    Guid CampaignId, Guid EventId, string EventTitle, string Code, bool IsEnabled, int? MaxRedemptions,
    int Redemptions, int LinkVisits, decimal DiscountTotal, DateTimeOffset CreatedAt);
