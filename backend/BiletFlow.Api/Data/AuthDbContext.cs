using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Data;

public sealed class AuthDbContext(DbContextOptions<AuthDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<AuthToken> AuthTokens => Set<AuthToken>();
    public DbSet<OrganizerProfile> OrganizerProfiles => Set<OrganizerProfile>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<TicketType> TicketTypes => Set<TicketType>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasKey(user => user.Id);
            entity.HasIndex(user => user.Email).IsUnique();
            entity.Property(user => user.Email).HasMaxLength(320).IsRequired();
            entity.Property(user => user.PasswordHash).IsRequired();
            entity.Property(user => user.Role).HasConversion<string>().HasMaxLength(32);
            entity.HasOne(user => user.OrganizerProfile)
                .WithOne(profile => profile.User)
                .HasForeignKey<OrganizerProfile>(profile => profile.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuthToken>(entity =>
        {
            entity.HasKey(token => token.Id);
            entity.HasIndex(token => new { token.UserId, token.Type, token.TokenHash });
            entity.Property(token => token.Type).HasConversion<string>().HasMaxLength(32);
            entity.HasOne(token => token.User).WithMany().HasForeignKey(token => token.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OrganizerProfile>(entity =>
        {
            entity.HasKey(profile => profile.Id);
            entity.HasIndex(profile => profile.UserId).IsUnique();
            entity.Property(profile => profile.BusinessName).HasMaxLength(200).IsRequired();
            entity.Property(profile => profile.DisplayName).HasMaxLength(120).IsRequired();
            entity.Property(profile => profile.ContactEmail).HasMaxLength(320);
        });

        modelBuilder.Entity<Event>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Slug).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(4000).IsRequired();
            entity.Property(e => e.Venue).HasMaxLength(250).IsRequired();
            entity.Property(e => e.City).HasMaxLength(120).IsRequired();
            entity.HasIndex(e => e.Slug).IsUnique();
            entity.Property(e => e.PaidSalesStatus).HasConversion<string>().HasMaxLength(32);
            entity.ToTable(table => table.HasCheckConstraint(
                "CK_Events_Capacity",
                "\"Capacity\" IS NULL OR (\"Capacity\" >= 1 AND \"TicketsIssued\" + \"TicketsReserved\" <= \"Capacity\")"));
            entity.HasOne(e => e.Organizer)
                .WithMany(user => user.Events)
                .HasForeignKey(e => e.OrganizerId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.TicketTypes)
                .WithOne(ticketType => ticketType.Event)
                .HasForeignKey(ticketType => ticketType.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TicketType>(entity =>
        {
            entity.HasKey(ticketType => ticketType.Id);
            entity.Property(ticketType => ticketType.Name).HasMaxLength(120).IsRequired();
            entity.Property(ticketType => ticketType.Description).HasMaxLength(1000);
            entity.Property(ticketType => ticketType.Price).HasPrecision(12, 2);
            entity.HasIndex(ticketType => new { ticketType.EventId, ticketType.IsHidden });
            entity.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TicketTypes_Inventory", "\"SoldQuantity\" + \"ReservedQuantity\" <= \"Quantity\"");
                table.HasCheckConstraint("CK_TicketTypes_Price", "\"Price\" >= 0");
            });
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.HasKey(order => order.Id);
            entity.Property(order => order.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(order => order.AttendeeName).HasMaxLength(200).IsRequired();
            entity.Property(order => order.AttendeeEmail).HasMaxLength(320).IsRequired();
            entity.Property(order => order.Total).HasPrecision(12, 2);
            entity.Property(order => order.DiscountTotal).HasPrecision(12, 2).HasDefaultValue(0m);
            entity.Property(order => order.FeeTotal).HasPrecision(12, 2).HasDefaultValue(0m);
            entity.HasIndex(order => new { order.AttendeeId, order.CreatedAt });
            entity.HasIndex(order => new { order.Status, order.CreatedAt });
            entity.HasOne(order => order.Attendee).WithMany(user => user.Orders)
                .HasForeignKey(order => order.AttendeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(order => order.Event).WithMany(ev => ev.Orders)
                .HasForeignKey(order => order.EventId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.HasKey(item => item.Id);
            entity.Property(item => item.TicketTypeName).HasMaxLength(120).IsRequired();
            entity.Property(item => item.UnitPrice).HasPrecision(12, 2);
            entity.Property(item => item.DiscountAmount).HasPrecision(12, 2).HasDefaultValue(0m);
            entity.HasOne(item => item.Order).WithMany(order => order.Items)
                .HasForeignKey(item => item.OrderId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.TicketType).WithMany(ticketType => ticketType.OrderItems)
                .HasForeignKey(item => item.TicketTypeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Ticket>(entity =>
        {
            entity.HasKey(ticket => ticket.Id);
            entity.HasIndex(ticket => ticket.Code).IsUnique();
            entity.Property(ticket => ticket.Code).HasMaxLength(64).IsRequired();
            entity.Property(ticket => ticket.AttendeeName).HasMaxLength(200).IsRequired();
            entity.Property(ticket => ticket.AttendeeEmail).HasMaxLength(320).IsRequired();
            entity.Property(ticket => ticket.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(ticket => ticket.OrderItemId).IsUnique();
            entity.HasIndex(ticket => new { ticket.EventId, ticket.Status });
            entity.HasOne(ticket => ticket.OrderItem).WithOne(item => item.Ticket)
                .HasForeignKey<Ticket>(ticket => ticket.OrderItemId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(ticket => ticket.Event).WithMany()
                .HasForeignKey(ticket => ticket.EventId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(payment => payment.Id);
            // Several attempts per order are allowed, but only one may succeed.
            entity.HasIndex(payment => payment.OrderId).IsUnique().HasFilter("\"Status\" = 'Succeeded'");
            entity.Property(payment => payment.Amount).HasPrecision(12, 2);
            entity.Property(payment => payment.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasOne(payment => payment.Order).WithMany(order => order.Payments)
                .HasForeignKey(payment => payment.OrderId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(log => log.Id);
            entity.Property(log => log.ActionType).HasConversion<string>().HasMaxLength(32);
            entity.Property(log => log.EntityType).HasMaxLength(64).IsRequired();
            entity.Property(log => log.Description).HasMaxLength(500).IsRequired();
            entity.HasIndex(log => new { log.EventId, log.CreatedAt });
        });
    }
}