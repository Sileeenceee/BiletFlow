using System.ComponentModel.DataAnnotations;

namespace BiletFlow.Api.Models;

/// <summary>Request to create a ticket type for an event.</summary>
public sealed record CreateTicketTypeRequest
{
    [Required, MaxLength(120)]
    public required string Name { get; init; }

    [MaxLength(1000)]
    public string? Description { get; init; }

    [Range(typeof(decimal), "0", "9999999999.99")]
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

    [Range(typeof(decimal), "0", "9999999999.99")]
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
    string? PaymentStatus = null);

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
