import discord
from config import TOKEN

intents = discord.Intents.default()
intents.message_content = True

client = discord.Client(intents=intents)

@client.event
async def on_ready():
    print(f"logged in : {client.user}")

@client.event
async def on_message(message):
        
    if message.author == client.user:
        return

    await message.channel.send(message.content)

client.run(TOKEN)