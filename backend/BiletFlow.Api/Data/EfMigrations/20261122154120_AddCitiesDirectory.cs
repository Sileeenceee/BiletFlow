using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace BiletFlow.Api.Data.EfMigrations
{
    /// <inheritdoc />
    public partial class AddCitiesDirectory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Cities",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cities", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "Cities",
                columns: new[] { "Id", "Name" },
                values: new object[,]
                {
                    { 1, "Almaty" },
                    { 2, "Astana" },
                    { 3, "Shymkent" },
                    { 4, "Karaganda" },
                    { 5, "Aktobe" },
                    { 6, "Taraz" },
                    { 7, "Pavlodar" },
                    { 8, "Ust-Kamenogorsk" },
                    { 9, "Semey" },
                    { 10, "Atyrau" },
                    { 11, "Kostanay" },
                    { 12, "Kyzylorda" },
                    { 13, "Uralsk" },
                    { 14, "Petropavlovsk" },
                    { 15, "Aktau" },
                    { 16, "Turkestan" },
                    { 17, "Taldykorgan" },
                    { 18, "Kokshetau" }
                });

            // Seeded rows use explicit ids, so move the identity sequence past them before any new insert.
            migrationBuilder.Sql(
                "SELECT setval(pg_get_serial_sequence('\"Cities\"', 'Id'), (SELECT MAX(\"Id\") FROM \"Cities\"));");

            // Nullable first: existing events get their CityId from the free-text City below.
            migrationBuilder.AddColumn<int>(
                name: "CityId",
                table: "Events",
                type: "integer",
                nullable: true);

            const string backfillCityIds = """
                UPDATE "Events" AS e
                SET "CityId" = c."Id", "City" = c."Name"
                FROM "Cities" AS c
                WHERE e."CityId" IS NULL AND lower(btrim(e."City")) = lower(c."Name");
                """;
            migrationBuilder.Sql(backfillCityIds);

            // Cities typed by organizers that are not in the seed list are added to the directory, so no event loses
            // its city. DISTINCT ON keeps one spelling per case-insensitive name to respect the unique IX_Cities_Name.
            migrationBuilder.Sql("""
                INSERT INTO "Cities" ("Name")
                SELECT DISTINCT ON (lower(btrim("City"))) btrim("City")
                FROM "Events"
                WHERE "CityId" IS NULL AND btrim("City") <> ''
                ORDER BY lower(btrim("City")), btrim("City");
                """);
            migrationBuilder.Sql(backfillCityIds);

            migrationBuilder.AlterColumn<int>(
                name: "CityId",
                table: "Events",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Events_CityId",
                table: "Events",
                column: "CityId");

            migrationBuilder.CreateIndex(
                name: "IX_Cities_Name",
                table: "Cities",
                column: "Name",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Events_Cities_CityId",
                table: "Events",
                column: "CityId",
                principalTable: "Cities",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Events_Cities_CityId",
                table: "Events");

            migrationBuilder.DropTable(
                name: "Cities");

            migrationBuilder.DropIndex(
                name: "IX_Events_CityId",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "CityId",
                table: "Events");
        }
    }
}
