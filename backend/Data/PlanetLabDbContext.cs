using Microsoft.EntityFrameworkCore;
using PlanetLab.Api.Models;

namespace PlanetLab.Api.Data;

public class PlanetLabDbContext : DbContext
{
    public PlanetLabDbContext(
        DbContextOptions<PlanetLabDbContext> options)
        : base(options)
    {
    }

    public DbSet<Planet> Planets { get; set; } = null!;
}