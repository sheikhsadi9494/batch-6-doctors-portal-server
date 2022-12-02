const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json())


const { MongoClient, ServerApiVersion, Collection, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cj5acxc.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function varifyJWT(req, res, next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
         res.status(401).send({message: 'unauthorized token'})
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SHHH, function(err, decoded){
        if(err){
             res.status(401).send({message: 'unauthorized token'})
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        const database = client.db("doctors_portal");
        const treatmentsCollection = database.collection("treatments");
        const appointmentBookingCollection = database.collection("appointmentBookings");
        const userCollection = database.collection("user");
        const doctorsCollection = database.collection("doctors");

        const verifyAdmin = async(req, res, next) => {
            const decodedEmail = req.decoded.email;
            console.log(decodedEmail)
            const query = {email: decodedEmail};
            const user = await userCollection.findOne(query);
            
            if(user?.role !== 'admin'){
                return res.status(403).send({message: 'user is not a admin'});
            }

            next();
        }

        app.get('/jwt',  async (req, res) => {
            const email = req.query.email;            
            const query = {email: email};
            const user = await userCollection.findOne(query);
            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN_SHHH, {expiresIn: '10h'});
                return res.send({accessToken: token})
            }
            res.status(403).send({accessToken: "unauthorized token"});
        })

        app.get('/treatmentsOptions', async (req, res) => {
            const date = req.query.date;
            const query = {};

            const treatments = await treatmentsCollection.find(query).toArray();
            // get the bookings of the provided date 
            const bookingQuery = {appointmentDate: date};
            const alreadyBooked =  await appointmentBookingCollection.find(bookingQuery).toArray();
            // code carefully 
             treatments.forEach(option => {
                const treatmentBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = treatmentBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
                option.slots = remainingSlots;
                // console.log(date, option.name, remainingSlots.length)
             })
            res.send(treatments);
        });

        app.get('/treatmentsSpecialty', async (req, res) => {
            const query = {};
            const result = await treatmentsCollection.find(query).project({name: 1}).toArray();
            res.send(result)
        })

        app.post('/appointmentBookings', async (req, res) => {            
            const appointment = req.body;
            const query = { 
                appointmentDate: appointment.appointmentDate,
                treatment: appointment.treatment,
                email: appointment.email
            };

            const alreadyBooked = await appointmentBookingCollection.find(query).toArray();

            if(alreadyBooked.length){
                const message = `You already have a booking on ${appointment.appointmentDate}`;
                return res.send({acknowledged: false, message})
            }

            const result = await appointmentBookingCollection.insertOne(appointment);
            res.send(result);
        })

        app.get('/bookedAppointments', varifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if(email !== decodedEmail){
                return res.status(403).send({message: 'unauthorized token'})
            }

            let query = {};
            if(email) {
                query = {email: email}
            }
            const appointment = await appointmentBookingCollection.find(query).toArray();
            res.send(appointment);
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        app.get('/users', async (req, res) => {
            const query = {};
            const users = await userCollection.find(query).toArray();
            res.send(users)
        })

        app.put('/users/admin/:id', varifyJWT, verifyAdmin, async (req, res) => {
         
            const id = req.params.id;
            const filter = {_id: ObjectId(id)};
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                  role: 'admin'
                },
              };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = {email};
            const user = await userCollection.findOne(query);
            // console.log({isAdmin: user.role === 'admin'})
            res.send({isAdmin: user.role === 'admin'});
        })

        app.post('/doctors', varifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        })
        
        app.get('/doctors', varifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const result = await doctorsCollection.find(query).toArray();
            res.send(result);
        })

        app.delete('/doctors/:id', varifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const result = await doctorsCollection.deleteOne(query);
            res.send(result);
        })

 

    }
    finally {

    }
}
run().catch()

app.get('/', (req, res) => {
    res.send('server running')
})

app.listen(port, () => {
    console.log('app running on port', port)
})