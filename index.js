const express = require("express")
const app = express()

app.get("/", (req, res) => {
  return res.send("ok")
})

app.listen(process.env.PORT || 4000);