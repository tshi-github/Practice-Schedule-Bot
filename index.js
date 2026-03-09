const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("Error: DISCORD_TOKEN environment variable is not set");
  process.exit(1);
}

console.log("Token loaded from environment variables");
// Add your bot logic here
