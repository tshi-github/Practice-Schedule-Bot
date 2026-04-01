import express from "express";

// Webサーバーを作成（スリープ防止用）
const app = express();
app.get("/", (req, res) => {
  res.send("Bot is alive!");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Web server running on port ${port}`);
});
