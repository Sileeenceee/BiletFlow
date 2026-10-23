using System.ComponentModel.DataAnnotations;

namespace BiletFlow.Api.Models;

/// <summary>Request to create a ticket type for an event.</summary>
public sealed record CreateTicketTypeRequest
{
    [Required, MaxLength(120)]
    public required string Name { get; init; }

    [MaxLength(1000)]
    public string? Description { get; init; }

    [Range(typeof(decimal), "0", "9999999999.99", ParseLimitsInInvariantCulture = true)]
    public decimal Price { get; init; }

    [Range(1, 1000000)]
    public int Quantity { get; init; }

    public DateTimeOffset? SalesStartAt { get; init; }
    public DateTimeOffset? SalesEndAt { get; init; }

    [Range(1, 100)]
    public int MaxPerOrder { get; init; } = 10;

    public bool IsHidden { get; init; }
}

/// <summary>Request to update a ticket type and its remaining inventory.</summary>
public sealed record UpdateTicketTypeRequest
{
    [Required, MaxLength(120)]
    public required string Name { get; init; }

    [MaxLength(1000)]
    public string? Description { get; init; }

    [Range(typeof(decimal), "0", "9999999999.99", ParseLimitsInInvariantCulture = true)]
    public decimal Price { get; init; }

    [Range(1, 1000000)]
    public int Quantity { get; init; }

    public DateTimeOffset? SalesStartAt { get; init; }
    public DateTimeOffset? SalesEndAt { get; init; }

    [Range(1, 100)]
    public int MaxPerOrder { get; init; } = 10;

    public bool IsHidden { get; init; }
}

/// <summary>One ticket type and quantity requested at checkout.</summary>
public sealed record CheckoutItemRequest
{
    public Guid TicketTypeId { get; init; }

    [Range(1, 100)]
    public int Quantity { get; init; }
}

/// <summary>Request to complete a free or simulated paid checkout.</summary>
public sealed record CheckoutRequest
{
    public Guid EventId { get; init; }

    [Required, MaxLength(200)]
    public required string AttendeeName { get; init; }

    [Required, EmailAddress, MaxLength(320)]
    public required string AttendeeEmail { get; init; }

    [Required, MinLength(1), MaxLength(10)]
    public required IReadOnlyList<CheckoutItemRequest> Items { get; init; }
    [MaxLength(40)]
    public string? PromoCode { get; init; }
    [MaxLength(64)]
    public string? CampaignToken { get; init; }
}

/// <summary>Update the attendee details or ticket selection of a pending reservation.</summary>
public sealed record UpdateOrderRequest
{
    [Required, MaxLength(200)]
    public required string AttendeeName { get; init; }

    [Required, EmailAddress, MaxLength(320)]
    public required string AttendeeEmail { get; init; }

    [Required, MinLength(1), MaxLength(10)]
    public required IReadOnlyList<CheckoutItemRequest> Items { get; init; }
    [MaxLength(40)]
    public string? PromoCode { get; init; }
    [MaxLength(64)]
    public string? CampaignToken { get; init; }
}

/// <summary>Ticket type and current inventory returned by the API.</summary>
public sealed record TicketTypeResponse(
    Guid Id,
    Guid EventId,
    string Name,
    string? Description,
    decimal Price,
    int Quantity,
    int SoldQuantity,
    int AvailableQuantity,
    DateTimeOffset? SalesStartAt,
    DateTimeOffset? SalesEndAt,
    int MaxPerOrder,
    bool IsHidden,
    int ReservedQuantity = 0,
    int RefundedQuantity = 0,
    int CheckedInQuantity = 0);

/// <summary>Issued ticket; the QR image data URI is filled only for single-order and checkout/pay responses.</summary>
public sealed record TicketResponse(
    Guid Id,
    string Code,
    string Status,
    string AttendeeName,
    string AttendeeEmail,
    string TicketTypeName,
    string? QrCodeDataUri);

/// <summary>Order line containing its issued tickets.</summary>
public sealed record OrderItemResponse(
    Guid TicketTypeId,
    string TicketTypeName,
    int Quantity,
    decimal UnitPrice,
    IReadOnlyList<TicketResponse> Tickets);

/// <summary>Order returned to its attendee or the event organizer.</summary>
public sealed record OrderResponse(
    Guid Id,
    Guid EventId,
    string EventTitle,
    string Status,
    string PaymentMode,
    decimal Total,
    DateTimeOffset CreatedAt,
    IReadOnlyList<OrderItemResponse> Items,
    decimal DiscountTotal = 0,
    decimal FeeTotal = 0,
    DateTimeOffset? ExpiresAt = null,
    string? PaymentStatus = null,
    string? PromoCode = null);

/// <summary>Request to pay a pending order in the payment simulation.</summary>
public sealed record PayOrderRequest
{
    /// <summary>"succeeded" (default) or "failed".</summary>
    public string? Outcome { get; init; }
}

/// <summary>Ticket holder row for the organizer attendee list.</summary>
public sealed record AttendeeResponse(
    Guid TicketId,
    Guid OrderId,
    string AttendeeName,
    string AttendeeEmail,
    string TicketTypeName,
    string Status);

/// <summary>Kind of failure returned by order actions so controllers can pick the HTTP status.</summary>
public enum ServiceError { None, BadRequest, NotFound, Conflict }

/// <summary>Request to enable paid sales in the clearly labelled academic simulation.</summary>
public sealed record ActivatePaidSalesSimulationRequest
{
    [Required]
    public bool ConfirmSimulationOnly { get; init; }
}

public sealed record CreatePromoCampaignRequest
{
    [Required, MaxLength(40)]
    public required string Code { get; init; }

    [Required]
    public required string DiscountType { get; init; }

    [Range(typeof(decimal), "0.01", "9999999999.99", ParseLimitsInInvariantCulture = true)]
    public decimal DiscountValue { get; init; }

    public DateTimeOffset? StartsAt { get; init; }
    public DateTimeOffset? EndsAt { get; init; }

    [Range(1, 10000000)]
    public int? MaxRedemptions { get; init; }

    public IReadOnlyList<Guid>? TicketTypeIds { get; init; }
}

public sealed record PromoCampaignResponse(
    Guid Id, Guid EventId, string Code, string DiscountType, decimal DiscountValue,
    DateTimeOffset? StartsAt, DateTimeOffset? EndsAt, int? MaxRedemptions, int Redemptions,
    bool IsEnabled, int LinkVisits, IReadOnlyList<Guid> TicketTypeIds, string CampaignUrl);

public sealed record PromoCampaignResolveResponse(
    Guid EventId, string EventTitle, string Code, string DiscountType, decimal DiscountValue,
    DateTimeOffset? EndsAt, string Message);

public sealed record PromoCampaignAnalyticsResponse(
    Guid CampaignId, string Code, int Redemptions, int TicketsSold,
    decimal GrossRevenue, decimal DiscountTotal, decimal NetRevenue);

public sealed record EventAdminRequest
{
    [Required, EmailAddress, MaxLength(320)]
    public required string Email { get; init; }
}
public sealed record EventAdminResponse(Guid UserId, string Email, DateTimeOffset AssignedAt);

public sealed record TicketVerificationRequest
{
    [Required, MaxLength(64)]
    public required string TicketCode { get; init; }
}

public sealed record TicketVerificationResponse(
    string Result, string Message, Guid? TicketId, string? EventTitle, string? TicketTypeName,
    string? AttendeeName, string? AttendeeEmail, string? TicketStatus, DateTimeOffset? CheckedInAt);

public sealed record CheckInSummaryResponse(
    Guid EventId, int Registered, int CheckedIn, int Remaining, decimal CheckInPercentage);

public sealed record CreateSupportCaseRequest
{
    [Required, MaxLength(40)]
    public required string Category { get; init; }
    [Required, MaxLength(200)]
    public required string Subject { get; init; }
    [Required, MaxLength(4000)]
    public required string Message { get; init; }
    public Guid? EventId { get; init; }
    public Guid? OrderId { get; init; }
    public Guid? TicketId { get; init; }
}

public sealed record CreateSupportMessageRequest
{
    [Required, MaxLength(4000)]
    public required string Body { get; init; }
}

public sealed record UpdateSupportCaseRequest
{
    [MaxLength(32)]
    public string? Status { get; init; }
    public Guid? AssignedToUserId { get; init; }
    public bool ClearAssignment { get; init; }
}

public sealed record InAppNotificationResponse(
    Guid Id, string Type, string Title, string Message, Guid? RelatedCaseId,
    DateTimeOffset CreatedAt, DateTimeOffset? ReadAt);

public sealed record SupportMessageResponse(Guid Id, Guid SenderUserId, string SenderRole, string Body, DateTimeOffset CreatedAt);
public sealed record SupportCaseResponse(
    Guid Id, string Type, string Category, string Subject, string Status, Guid RequesterUserId,
    Guid? EventId, Guid? OrderId, Guid? TicketId, Guid? AssignedToUserId,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, IReadOnlyList<SupportMessageResponse> Messages);
