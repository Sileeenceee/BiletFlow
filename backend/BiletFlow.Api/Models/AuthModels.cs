using System.Text.Json.Serialization;

namespace BiletFlow.Api.Models;

public enum UserRole { Attendee, Organizer, EventAdmin, PlatformAdmin }
public enum AuthTokenType { EmailVerification, PasswordReset }
public enum OrderStatus { Completed, Cancelled, Refunded }
public enum TicketStatus { Valid, CheckedIn, Cancelled, Refunded }
public enum PaymentStatus { SimulationSucceeded }

public sealed class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }
    public UserRole Role { get; set; } = UserRole.Attendee;
    public bool EmailConfirmed { get; set; }
    public bool IsSuspended { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [JsonIgnore]
    public OrganizerProfile? OrganizerProfile { get; set; }
    [JsonIgnore]
    public ICollection<Event> Events { get; set; } = new List<Event>();
    [JsonIgnore]
    public ICollection<Order> Orders { get; set; } = new List<Order>();
}

public sealed class AuthToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public required AuthTokenType Type { get; set; }
    public required string TokenHash { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
}

public sealed class OrganizerProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    [JsonIgnore]
    public AppUser User { get; set; } = null!;
    public string BusinessName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? ContactEmail { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Bio { get; set; }
    public string? Website { get; set; }
    public bool IsVerified { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class Event
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrganizerId { get; set; }
    [JsonIgnore]
    public AppUser Organizer { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Venue { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public DateTimeOffset StartDateUtc { get; set; }
    public DateTimeOffset EndDateUtc { get; set; }
    public bool IsPublished { get; set; }
    public bool PaidSalesActivated { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }
    [JsonIgnore]
    public ICollection<TicketType> TicketTypes { get; set; } = new List<TicketType>();
    [JsonIgnore]
    public ICollection<Order> Orders { get; set; } = new List<Order>();
}

public sealed class TicketType
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    [JsonIgnore]
    public Event Event { get; set; } = null!;
    public required string Name { get; set; }
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public int Quantity { get; set; }
    public int SoldQuantity { get; set; }
    public DateTimeOffset? SalesStartAt { get; set; }
    public DateTimeOffset? SalesEndAt { get; set; }
    public int MaxPerOrder { get; set; } = 10;
    public bool IsHidden { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [JsonIgnore]
    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();
}

public sealed class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AttendeeId { get; set; }
    [JsonIgnore]
    public AppUser Attendee { get; set; } = null!;
    public Guid EventId { get; set; }
    [JsonIgnore]
    public Event Event { get; set; } = null!;
    public OrderStatus Status { get; set; } = OrderStatus.Completed;
    public decimal Total { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [JsonIgnore]
    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
    [JsonIgnore]
    public Payment? Payment { get; set; }
}

public sealed class OrderItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderId { get; set; }
    [JsonIgnore]
    public Order Order { get; set; } = null!;
    public Guid TicketTypeId { get; set; }
    [JsonIgnore]
    public TicketType TicketType { get; set; } = null!;
    public required string TicketTypeName { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    [JsonIgnore]
    public ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();
}

public sealed class Ticket
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderItemId { get; set; }
    [JsonIgnore]
    public OrderItem OrderItem { get; set; } = null!;
    public required string Code { get; set; }
    public required string AttendeeName { get; set; }
    public required string AttendeeEmail { get; set; }
    public TicketStatus Status { get; set; } = TicketStatus.Valid;
    public DateTimeOffset IssuedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderId { get; set; }
    [JsonIgnore]
    public Order Order { get; set; } = null!;
    public decimal Amount { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.SimulationSucceeded;
    public required string ProviderReference { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}