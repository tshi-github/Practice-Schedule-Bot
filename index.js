import express from "express";

const app = express()

app.get("/", (req, res) => {
  return res.send("ok")
})

app.listen(process.env.port || 4000);