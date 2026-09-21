import "dotenv/config";
import connectDB from "./configs/db.js";
import createApp from "./app.js";

const port = 3000;

await connectDB();
const app = createApp();

app.listen(port, () =>
  console.log(`Server listening at http://localhost:${port}`)
);
