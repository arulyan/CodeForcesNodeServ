require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI,{ 
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log("DB is Connected");
})
.catch((err) => console.log(err));