using System.Text.Json.Serialization;

namespace BiletFlow.Api.Models;

// Bonus feature: assigned seating. The price always lives on the ticket type, never on the seat.

public enum SeatingMode { General, Assigned }

public sealed class Venue
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Address { get; set; }
    [JsonIgnore]
    public ICollection<VenueSection> Sections { get; set; } = new List<VenueSection>();
}

public sealed class VenueSection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid VenueId { get; set; }
    [JsonIgnore]
    public Venue Venue { get; set; } = null!;
    public required string Name { get; set; }
    [JsonIgnore]
    public ICollection<Seat> Seats { get; set; } = new List<Seat>();
}

public sealed class Seat
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SectionId { get; set; }
    [JsonIgnore]
    public VenueSection Section { get; set; } = null!;
    public required string RowLabel { get; set; }
    public required string Number { get; set; }
    public bool IsAccessible { get; set; }
}

/// <summary>Links a ticket type to a venue section for one event, so the price of a seat is unambiguous.</summary>
public sealed class TicketTypeSection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    [JsonIgnore]
    public Event Event { get; set; } = null!;
    public Guid TicketTypeId { get; set; }
    [JsonIgnore]
    public TicketType TicketType { get; set; } = null!;
    public Guid SectionId { get; set; }
    [JsonIgnore]
    public VenueSection Section { get; set; } = null!;
}

/// <summary>Temporary hold of a seat for an unpaid order. Expired holds are deleted before a new one is inserted.</summary>
public sealed class SeatHold
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventId { get; set; }
    [JsonIgnore]
    public Event Event { get; set; } = null!;
    public Guid SeatId { get; set; }
    [JsonIgnore]
    public Seat Seat { get; set; } = null!;
    public Guid OrderId { get; set; }
    [JsonIgnore]
    public Order Order { get; set; } = null!;
    public DateTimeOffset ExpiresAt { get; set; }
}
