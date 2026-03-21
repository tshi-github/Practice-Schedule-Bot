import discord
from discord.ext import commands
import os
from config import TOKEN
from datetime import datetime

TOKEN = os.getenv("TOKEN")

intents = discord.Intents.default()
intents.message_content = True
intents.reactions = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"logged in : {bot.user}")

@bot.command()
async def event(ctx, date, time, *, content):

    message = await ctx.send(
        f"{date} {time}\n{content}"
    )

    await message.add_reaction("⭕")
    await message.add_reaction("❌")
    await message.add_reaction("🔺")

    year = datetime.now().year
    month, day = map(int, date.split("/"))
    start, end = time.split("-")

    start_dt = datetime.strptime(f"{year}-{month}-{day} {start}", "%Y-%m-%d %H:%M")
    end_dt = datetime.strptime(f"{year}-{month}-{day} {end}", "%Y-%m-%d %H:%M")

    print("開始時間:", start_dt.isoformat())
    print("終了時間:", end_dt.isoformat())

@bot.event
async def on_reaction_add(reaction, user):

    if user.bot:
        return
    
    emoji = reaction.emoji
    if emoji == "⭕":
        print(f"{user} ({user.id})")


if __name__ == "__main__":

    bot.run(TOKEN)