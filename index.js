import express from "express";
import bypassRouter from "./routes/bypass.js";

const app = express();
const PORT = 3000;

app.use(express.json());

app.use((req, res, next) => {
  req.log = {
    info: (...args) => console.log("[info]", ...args),
    error: (...args) => console.error("[error]", ...args)
  };
  next();
});

app.get("/", (req, res) => {
  res.json({
    name: "Bypass-Delta",
    usage: "POST /bypass with { url: '...' }",
    supported: [
      "auth.platorelay.com",
      "gateway.platoboost.com",
      "loot.link",
      "lootlabs.gg",
      "work.ink",
      "boost.ink",
      "linkvertise.com"
    ]
  });
});

app.use(bypassRouter);

app.listen(PORT, () => {
  console.log(`Bypass-Delta server running on http://localhost:${PORT}`);
});
