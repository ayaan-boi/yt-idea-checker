import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("."));

app.post("/api/claude", async (req, res) => {
try {
const response = await fetch(
"https://api.anthropic.com/v1/messages",
{
method: "POST",
headers: {
"x-api-key": process.env.ANTHROPIC_API_KEY,
"anthropic-version": "2023-06-01",
"content-type": "application/json"
},
body: JSON.stringify(req.body)
}
);

```
const data = await response.json();

if (!response.ok) {
  return res.status(response.status).json(data);
}

res.json(data);
```

} catch (err) {
console.error(err);
res.status(500).json({
error: err.message
});
}
});

app.listen(3000, () => {
console.log("Server running at http://localhost:3000");
});
