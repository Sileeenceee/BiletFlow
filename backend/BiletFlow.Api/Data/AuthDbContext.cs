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
            entity.Property(profile => profile.PhoneNumber).HasMaxLength(30);
            entity.Property(profile => profile.Bio).HasMaxLength(2000);
            entity.Property(profile => profile.Website).HasMaxLength(500);
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
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.HasKey(order => order.Id);
            entity.Property(order => order.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(order => order.Total).HasPrecision(12, 2);
            entity.HasIndex(order => new { order.AttendeeId, order.CreatedAt });
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
            entity.HasOne(ticket => ticket.OrderItem).WithMany(item => item.Tickets)
                .HasForeignKey(ticket => ticket.OrderItemId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(payment => payment.Id);
            entity.HasIndex(payment => payment.OrderId).IsUnique();
            entity.Property(payment => payment.Amount).HasPrecision(12, 2);
            entity.Property(payment => payment.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(payment => payment.ProviderReference).HasMaxLength(100).IsRequired();
            entity.HasOne(payment => payment.Order).WithOne(order => order.Payment)
                .HasForeignKey<Payment>(payment => payment.OrderId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}