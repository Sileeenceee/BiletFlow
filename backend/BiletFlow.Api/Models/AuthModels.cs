using System.Text.Json.Serialization;

namespace BiletFlow.Api.Models;

public enum UserRole { Attendee, Organizer, EventAdmin, PlatformAdmin }
public enum AuthTokenType { EmailVerification, PasswordReset, RefreshToken }
public enum OrderStatus { Pending, Confirmed, Cancelled, Refunded }
public enum TicketStatus { Valid, CheckedIn, Cancelled, Refunded }
public enum PaymentStatus { Pending, Succeeded, Failed }
public enum PaidSalesStatus { None, Pending, Active, Suspended }
public enum EventVisibility { Public, Unlisted, Private }
public enum PromoDiscountType { Percentage, FixedKzt }
public enum SupportCaseType { Attendee, Organizer }
public enum SupportCaseStatus { Open, InProgress, WaitingForCustomer, Resolved }
public enum AuditActionType
{
    OrderCreated, OrderUpdated, PaymentSucceeded, PaymentFailed, OrderCancelled, OrderExpired,
    EventCancelled, PaidSalesActivated, PaidSalesSuspended, PromoCampaignCreated, PromoCampaignUpdated,
    PromoCampaignDisabled, EventAdminAssigned, TicketCheckedIn, TicketCheckInReversed, SupportCaseCreated, SupportCaseAssigned,
    SupportCaseStatusChanged, SupportMessageCreated
}

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
    [JsonIgnore]
    public ICollection<EventAdminAssignment> EventAdminAssignments { get; set; } = new List<EventAdminAssignment>();
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
    public string? SandboxPayoutProvider { get; set; }
    public string? SandboxPayoutReference { get; set; }
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
    public string? Category { get; set; }
    public string[] ImageUrls { get; set; } = [];
    public DateTimeOffset StartDateUtc { get; set; }
    public DateTimeOffset EndDateUtc { get; set; }
    public bool IsPublished { get; set; }
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public EventVisibility Visibility { get; set; } = EventVisibility.Public;
    public DateTimeOffset? RegistrationOpensAt { get; set; }
    public DateTimeOffset? RegistrationClosesAt { get; set; }
    public bool IsCancelled { get; set; }
    /// <summary>Maximum number of tickets for the whole event; null means unlimited.</summary>
    public int? Capacity { get; set; }
    public int TicketsIssued { get; set; }
    public int TicketsReserved { get; set; }
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public PaidSalesStatus PaidSalesStatus { get; set; } = PaidSalesStatus.None;
    public bool PaidTermsAccepted { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }
    [JsonIgnore]
    public ICollection<TicketType> TicketTypes { get; set; } = new List<TicketType>();
    [JsonIgnore]
    public ICollection<Order> Orders { get; set; } = new List<Order>();
    [JsonIgnore]
    public ICollection<PromoCampaign> PromoCampaigns { get; set; } = new List<PromoCampaign>();
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
    public int ReservedQuantity { get; set; }
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
    public required string AttendeeName { get; set; }
    public required string AttendeeEmail { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public decimal DiscountTotal { get; set; }
    public decimal FeeTotal { get; set; }
    public decimal Total { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [JsonIgnore]
    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
    [JsonIgnore]
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public Guid? PromoCampaignId { get; set; }
    [JsonIgnore]
    public PromoCampaign? PromoCampaign { get; set; }
    public string? PromoCode { get; set; }
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
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    /// <summary>Created only after the order is confirmed (free checkout or successful payment).</summary>
    [JsonIgnore]
    public Ticket? Ticket { get; set; }
}

public sealed class Ticket
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderItemId { get; set; }
    [JsonIgnore]
    public OrderItem OrderItem { get; set; } = null!;
    public Guid EventId { get; set; }
    [JsonIgnore]
    public Event Event { get; set; } = null!;
    public required string Code { get; set; }
    public required string AttendeeName { get; set; }
    public required string AttendeeEmail { get; set; }
    public TicketStatus Status { get; set; } = TicketStatus.Valid;
}

public sealed class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderId { get; set; }
    [JsonIgnore]
    public Order Order { get; set; } = null!;
    public decimal Amount { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public bool IsSimulated { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? EventId { get; set; }
    public Guid? ActorUserId { get; set; }
    public AuditActionType ActionType { get; set; }
    public required string EntityType { get; set; }
    public Guid? EntityId { get; set; }
    public required string Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PromoCampaign
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    [JsonIgnore]
    public Event Event { get; set; } = null!;
    public Guid CreatedByUserId { get; set; }
    [JsonIgnore]
    public AppUser CreatedByUser { get; set; } = null!;
    public required string Code { get; set; }
    public required string CampaignToken { get; set; }
    public PromoDiscountType DiscountType { get; set; }
    public decimal DiscountValue { get; set; }
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? EndsAt { get; set; }
    public int? MaxRedemptions { get; set; }
    public bool IsEnabled { get; set; } = true;
    public int LinkVisits { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [JsonIgnore]
    public ICollection<PromoCampaignTicketType> ApplicableTicketTypes { get; set; } = new List<PromoCampaignTicketType>();
    [JsonIgnore]
    public ICollection<Order> Orders { get; set; } = new List<Order>();
}

public sealed class PromoCampaignTicketType
{
    public Guid CampaignId { get; set; }
    [JsonIgnore]
    public PromoCampaign Campaign { get; set; } = null!;
    public Guid TicketTypeId { get; set; }
    [JsonIgnore]
    public TicketType TicketType { get; set; } = null!;
}

public sealed class EventAdminAssignment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    [JsonIgnore]
    public Event Event { get; set; } = null!;
    public Guid UserId { get; set; }
    [JsonIgnore]
    public AppUser User { get; set; } = null!;
    public Guid AssignedByUserId { get; set; }
    public DateTimeOffset AssignedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TicketCheckIn
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TicketId { get; set; }
    [JsonIgnore]
    public Ticket Ticket { get; set; } = null!;
    public Guid EventId { get; set; }
    public Guid CheckedInByUserId { get; set; }
    public DateTimeOffset CheckedInAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ReversedByUserId { get; set; }
    public DateTimeOffset? ReversedAt { get; set; }
}

public sealed class SupportCase
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequesterUserId { get; set; }
    [JsonIgnore]
    public AppUser Requester { get; set; } = null!;
    public SupportCaseType Type { get; set; }
    public required string Category { get; set; }
    public required string Subject { get; set; }
    public SupportCaseStatus Status { get; set; } = SupportCaseStatus.Open;
    public Guid? EventId { get; set; }
    [JsonIgnore]
    public Event? Event { get; set; }
    public Guid? OrderId { get; set; }
    [JsonIgnore]
    public Order? Order { get; set; }
    public Guid? TicketId { get; set; }
    [JsonIgnore]
    public Ticket? Ticket { get; set; }
    public Guid? AssignedToUserId { get; set; }
    [JsonIgnore]
    public AppUser? AssignedToUser { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    [JsonIgnore]
    public ICollection<SupportMessage> Messages { get; set; } = new List<SupportMessage>();
}

public sealed class SupportMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CaseId { get; set; }
    [JsonIgnore]
    public SupportCase Case { get; set; } = null!;
    public Guid SenderUserId { get; set; }
    [JsonIgnore]
    public AppUser Sender { get; set; } = null!;
    public required string Body { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class InAppNotification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    [JsonIgnore]
    public AppUser User { get; set; } = null!;
    public required string Type { get; set; }
    public required string Title { get; set; }
    public required string Message { get; set; }
    public Guid? RelatedCaseId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReadAt { get; set; }
}