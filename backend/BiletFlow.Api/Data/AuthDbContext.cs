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
    public DbSet<PromoCampaign> PromoCampaigns => Set<PromoCampaign>();
    public DbSet<PromoCampaignTicketType> PromoCampaignTicketTypes => Set<PromoCampaignTicketType>();
    public DbSet<EventAdminAssignment> EventAdminAssignments => Set<EventAdminAssignment>();
    public DbSet<TicketCheckIn> TicketCheckIns => Set<TicketCheckIn>();
    public DbSet<SupportCase> SupportCases => Set<SupportCase>();
    public DbSet<SupportMessage> SupportMessages => Set<SupportMessage>();
    public DbSet<InAppNotification> InAppNotifications => Set<InAppNotification>();
    public DbSet<Venue> Venues => Set<Venue>();
    public DbSet<VenueSection> VenueSections => Set<VenueSection>();
    public DbSet<Seat> Seats => Set<Seat>();
    public DbSet<TicketTypeSection> TicketTypeSections => Set<TicketTypeSection>();
    public DbSet<SeatHold> SeatHolds => Set<SeatHold>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasKey(user => user.Id);
            entity.HasIndex(user => user.Email).IsUnique();
            entity.Property(user => user.Email).HasMaxLength(320).IsRequired();
            entity.Property(user => user.PasswordHash).IsRequired();
            entity.Property(user => user.FullName).HasMaxLength(200).IsRequired();
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
            entity.Property(profile => profile.SandboxPayoutProvider).HasMaxLength(100);
            entity.Property(profile => profile.SandboxPayoutReference).HasMaxLength(200);
        });

        modelBuilder.Entity<Event>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Slug).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(4000).IsRequired();
            entity.Property(e => e.Venue).HasMaxLength(250).IsRequired();
            entity.Property(e => e.City).HasMaxLength(120).IsRequired();
            entity.Property(e => e.Category).HasMaxLength(120);
            entity.Property(e => e.ImageUrls).HasColumnType("text[]").IsRequired();
            entity.HasIndex(e => e.Slug).IsUnique();
            entity.Property(e => e.PaidSalesStatus).HasConversion<string>().HasMaxLength(32);
            entity.Property(e => e.Visibility).HasConversion<string>().HasMaxLength(16);
            entity.Property(e => e.VenueAddress).HasMaxLength(300).IsRequired();
            entity.Property(e => e.SeatingMode).HasConversion<string>().HasMaxLength(32);
            entity.Property(e => e.Timezone).HasMaxLength(64).IsRequired().HasDefaultValue("Asia/Almaty");
            entity.ToTable(table =>
            {
                table.HasCheckConstraint(
                    "CK_Events_Capacity",
                    "\"Capacity\" IS NULL OR (\"Capacity\" >= 1 AND \"TicketsIssued\" + \"TicketsReserved\" <= \"Capacity\")");
                table.HasCheckConstraint("CK_Events_Dates", "\"EndDateUtc\" > \"StartDateUtc\"");
            });
            entity.HasOne(e => e.Organizer)
                .WithMany(user => user.Events)
                .HasForeignKey(e => e.OrganizerId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.TicketTypes)
                .WithOne(ticketType => ticketType.Event)
                .HasForeignKey(ticketType => ticketType.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.SeatingVenue).WithMany()
                .HasForeignKey(e => e.VenueId).OnDelete(DeleteBehavior.Restrict);
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
                table.HasCheckConstraint("CK_TicketTypes_SalesWindow", "\"SalesEndAt\" > \"SalesStartAt\"");
            });

        });

        modelBuilder.Entity<PromoCampaign>(entity =>
        {
            entity.HasKey(campaign => campaign.Id);
            entity.HasIndex(campaign => campaign.Code).IsUnique();
            entity.HasIndex(campaign => campaign.CampaignToken).IsUnique();
            entity.Property(campaign => campaign.Code).HasMaxLength(40).IsRequired();
            entity.Property(campaign => campaign.CampaignToken).HasMaxLength(64).IsRequired();
            entity.Property(campaign => campaign.DiscountType).HasConversion<string>().HasMaxLength(24);
            entity.Property(campaign => campaign.DiscountValue).HasPrecision(12, 2);
            entity.HasOne(campaign => campaign.Event).WithMany(ev => ev.PromoCampaigns)
                .HasForeignKey(campaign => campaign.EventId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(campaign => campaign.CreatedByUser).WithMany()
                .HasForeignKey(campaign => campaign.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
            entity.ToTable(table =>
            {
                table.HasCheckConstraint("CK_PromoCampaigns_DiscountValue", "\"DiscountValue\" > 0");
                table.HasCheckConstraint("CK_PromoCampaigns_MaxRedemptions", "\"MaxRedemptions\" IS NULL OR \"MaxRedemptions\" > 0");
            });
        });

        modelBuilder.Entity<PromoCampaignTicketType>(entity =>
        {
            entity.HasKey(row => new { row.CampaignId, row.TicketTypeId });
            entity.HasOne(row => row.Campaign).WithMany(campaign => campaign.ApplicableTicketTypes)
                .HasForeignKey(row => row.CampaignId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.TicketType).WithMany()
                .HasForeignKey(row => row.TicketTypeId).OnDelete(DeleteBehavior.Restrict);
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
            entity.Property(order => order.PromoCode).HasMaxLength(40);
            entity.HasIndex(order => new { order.AttendeeId, order.CreatedAt }).IsDescending(false, true);
            entity.HasIndex(order => new { order.EventId, order.CreatedAt });
            entity.ToTable(table => table.HasCheckConstraint(
                "CK_Orders_Amounts", "\"Total\" >= 0 AND \"DiscountTotal\" >= 0 AND \"FeeTotal\" >= 0"));
            entity.HasIndex(order => new { order.Status, order.CreatedAt });
            entity.HasOne(order => order.Attendee).WithMany(user => user.Orders)
                .HasForeignKey(order => order.AttendeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(order => order.Event).WithMany(ev => ev.Orders)
                .HasForeignKey(order => order.EventId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(order => order.PromoCampaign).WithMany(campaign => campaign.Orders)
                .HasForeignKey(order => order.PromoCampaignId).OnDelete(DeleteBehavior.Restrict);
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
            entity.HasOne(item => item.Seat).WithMany()
                .HasForeignKey(item => item.SeatId).OnDelete(DeleteBehavior.Restrict);
            // Kept explicitly: the partial index below skips rows without a seat, and EF would otherwise drop this one.
            entity.HasIndex(item => item.OrderId);
            entity.HasIndex(item => new { item.OrderId, item.SeatId }).IsUnique().HasFilter("\"SeatId\" IS NOT NULL");
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
            entity.HasOne(ticket => ticket.Seat).WithMany()
                .HasForeignKey(ticket => ticket.SeatId).OnDelete(DeleteBehavior.Restrict);
            // A seat can belong to only one live ticket per event; cancelled and refunded tickets free it.
            entity.HasIndex(ticket => new { ticket.EventId, ticket.SeatId }).IsUnique()
                .HasFilter("\"SeatId\" IS NOT NULL AND \"Status\" NOT IN ('Cancelled', 'Refunded')");
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
            entity.HasIndex(log => new { log.EventId, log.CreatedAt }).IsDescending(false, true);
            entity.HasIndex(log => new { log.EventId, log.ActionType });
        });

        modelBuilder.Entity<EventAdminAssignment>(entity =>
        {
            entity.HasKey(assignment => assignment.Id);
            entity.HasIndex(assignment => new { assignment.EventId, assignment.UserId }).IsUnique();
            entity.HasOne(assignment => assignment.Event).WithMany()
                .HasForeignKey(assignment => assignment.EventId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(assignment => assignment.User).WithMany(user => user.EventAdminAssignments)
                .HasForeignKey(assignment => assignment.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(assignment => assignment.AssignedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<TicketCheckIn>(entity =>
        {
            entity.HasKey(checkIn => checkIn.Id);
            entity.HasIndex(checkIn => new { checkIn.TicketId, checkIn.CheckedInAt });
            entity.HasOne(checkIn => checkIn.Ticket).WithMany()
                .HasForeignKey(checkIn => checkIn.TicketId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SupportCase>(entity =>
        {
            entity.HasKey(supportCase => supportCase.Id);
            entity.HasIndex(supportCase => new { supportCase.RequesterUserId, supportCase.UpdatedAt });
            entity.Property(supportCase => supportCase.Type).HasConversion<string>().HasMaxLength(24);
            entity.Property(supportCase => supportCase.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(supportCase => supportCase.Category).HasMaxLength(40).IsRequired();
            entity.Property(supportCase => supportCase.Subject).HasMaxLength(200).IsRequired();
            entity.HasOne(supportCase => supportCase.Requester).WithMany()
                .HasForeignKey(supportCase => supportCase.RequesterUserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(supportCase => supportCase.Event).WithMany()
                .HasForeignKey(supportCase => supportCase.EventId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(supportCase => supportCase.Order).WithMany()
                .HasForeignKey(supportCase => supportCase.OrderId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(supportCase => supportCase.Ticket).WithMany()
                .HasForeignKey(supportCase => supportCase.TicketId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(supportCase => supportCase.AssignedToUser).WithMany()
                .HasForeignKey(supportCase => supportCase.AssignedToUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SupportMessage>(entity =>
        {
            entity.HasKey(message => message.Id);
            entity.Property(message => message.Body).HasMaxLength(4000).IsRequired();
            entity.HasIndex(message => new { message.CaseId, message.CreatedAt });
            entity.HasOne(message => message.Case).WithMany(supportCase => supportCase.Messages)
                .HasForeignKey(message => message.CaseId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(message => message.Sender).WithMany()
                .HasForeignKey(message => message.SenderUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<InAppNotification>(entity =>
        {
            entity.HasKey(notification => notification.Id);
            entity.HasIndex(notification => new { notification.UserId, notification.CreatedAt });
            entity.Property(notification => notification.Type).HasMaxLength(40).IsRequired();
            entity.Property(notification => notification.Title).HasMaxLength(160).IsRequired();
            entity.Property(notification => notification.Message).HasMaxLength(500).IsRequired();
            entity.HasOne(notification => notification.User).WithMany()
                .HasForeignKey(notification => notification.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Venue>(entity =>
        {
            entity.HasKey(venue => venue.Id);
            entity.Property(venue => venue.Name).HasMaxLength(200).IsRequired();
            entity.Property(venue => venue.Address).HasMaxLength(300).IsRequired();
        });

        modelBuilder.Entity<VenueSection>(entity =>
        {
            entity.HasKey(section => section.Id);
            entity.Property(section => section.Name).HasMaxLength(100).IsRequired();
            entity.HasOne(section => section.Venue).WithMany(venue => venue.Sections)
                .HasForeignKey(section => section.VenueId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Seat>(entity =>
        {
            entity.HasKey(seat => seat.Id);
            entity.Property(seat => seat.RowLabel).HasMaxLength(20).IsRequired();
            entity.Property(seat => seat.Number).HasMaxLength(20).IsRequired();
            entity.HasIndex(seat => new { seat.SectionId, seat.RowLabel, seat.Number }).IsUnique();
            entity.HasOne(seat => seat.Section).WithMany(section => section.Seats)
                .HasForeignKey(seat => seat.SectionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TicketTypeSection>(entity =>
        {
            entity.HasKey(link => link.Id);
            // One section is served by one ticket type, so the price of a seat is unambiguous.
            entity.HasIndex(link => new { link.EventId, link.SectionId }).IsUnique();
            entity.HasOne(link => link.Event).WithMany()
                .HasForeignKey(link => link.EventId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(link => link.TicketType).WithMany()
                .HasForeignKey(link => link.TicketTypeId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(link => link.Section).WithMany()
                .HasForeignKey(link => link.SectionId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SeatHold>(entity =>
        {
            entity.HasKey(hold => hold.Id);
            // Expired holds are deleted before a new one is inserted; the index cannot use now().
            entity.HasIndex(hold => new { hold.EventId, hold.SeatId }).IsUnique();
            entity.HasOne(hold => hold.Event).WithMany()
                .HasForeignKey(hold => hold.EventId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(hold => hold.Seat).WithMany()
                .HasForeignKey(hold => hold.SeatId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(hold => hold.Order).WithMany()
                .HasForeignKey(hold => hold.OrderId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}