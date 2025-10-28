// server.js (Kod Backend menggunakan Node.js dan Express)
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Konfigurasi Middleware
app.use(cors()); 
app.use(bodyParser.json({ limit: '5mb' })); 
app.use(express.static('public')); 

// --- Konfigurasi MongoDB ---
// GANTIKAN DENGAN URI ANDA YANG SEBENAR!
const MONGODB_URI = 'mongodb://localhost:27017/uasa_db'; 
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Berjaya Disambungkan!'))
    .catch(err => console.error('❌ Ralat Sambungan MongoDB:', err));

// --- Skema Model MongoDB ---
const PelajarSchema = new mongoose.Schema({
    nama: { type: String, required: true },
    id: { type: String },
    markah: Object 
});

const KelasSchema = new mongoose.Schema({
    namaKelas: { type: String, required: true, unique: true },
    pelajar: [PelajarSchema],
}, { timestamps: true });

const Kelas = mongoose.model('Kelas', KelasSchema);

// --- Konfigurasi Multer ---
// Simpan fail yang dimuat naik ke folder 'uploads/'
const upload = multer({ dest: 'uploads/' });

// --- Endpoints API ---

// 1. Dapatkan Senarai Semua Kelas Yang Disimpan (Untuk Dropdown)
app.get('/api/kelas', async (req, res) => {
    try {
        // Query untuk mendapatkan nama kelas sahaja
        const kelasList = await Kelas.find({}, 'namaKelas').sort({ namaKelas: 1 });
        res.json(kelasList); // ✅ PEMBETULAN: ganti 'classList' dengan 'kelasList'
    } catch (error) {
        console.error("Ralat pada /api/kelas:", error);
        res.status(500).send('Ralat mendapatkan senarai kelas: ' + error.message); 
    }
});

// 2. Dapatkan Data Kelas Tertentu
app.get('/api/kelas/:namaKelas', async (req, res) => {
    try {
        const kelasData = await Kelas.findOne({ namaKelas: req.params.namaKelas });
        if (!kelasData) {
            return res.status(404).send('Kelas tidak ditemui.');
        }
        res.json(kelasData);
    } catch (error) {
        res.status(500).send('Ralat mendapatkan data kelas: ' + error.message);
    }
});

// 3. Simpan/Kemas Kini Data Markah Kelas
app.post('/api/kelas/simpan', async (req, res) => {
    const { namaKelas, pelajar } = req.body;
    if (!namaKelas || !pelajar) {
        return res.status(400).send('Nama kelas atau data pelajar diperlukan.');
    }
    
    try {
        const kemaskini = await Kelas.findOneAndUpdate(
            { namaKelas: namaKelas },
            { $set: { pelajar: pelajar } },
            { new: true, runValidators: true } 
        );
        
        if (!kemaskini) {
            return res.status(404).send('Kelas tidak ditemui untuk dikemas kini.');
        }

        res.status(200).send({ message: 'Data berjaya disimpan!', savedData: kemaskini });
    } catch (error) {
        res.status(500).send('Ralat menyimpan data: ' + error.message);
    }
});

// 4. Proses Muat Naik Fail CSV Baru (Cipta/Kemas Kini Senarai Pelajar)
app.post('/api/kelas/upload', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('Tiada fail dimuat naik.');
    }
    
    const namaKelas = req.body.namaKelas;
    if (!namaKelas) {
        fs.unlinkSync(req.file.path); 
        return res.status(400).send('Nama Kelas diperlukan untuk muat naik.');
    }

    let csvTeks;
    try {
        csvTeks = fs.readFileSync(req.file.path, 'utf8');
    } catch (e) {
        fs.unlinkSync(req.file.path);
        return res.status(500).send('Ralat membaca fail CSV.');
    }
    
    fs.unlinkSync(req.file.path); 

    const baris = csvTeks.split('\n').filter(b => b.trim() !== '');
    let newPelajarData = [];
    const subjekDefault = ['bm', 'bi', 'mt', 'sn', 'pai', 'ba', 'pm', 'pj', 'pk', 'sej', 'mz', 'psv', 'rbt'];
    
    for (let i = 1; i < baris.length; i++) {
        const data = baris[i].split(',').map(item => item.trim());
        if (data.length < 2 || data[0] === "") continue; 
        
        const nama = data[0];
        const id = data[1];

        let markah = {};
        subjekDefault.forEach(s => markah[s] = undefined);
        
        newPelajarData.push({ nama: nama, id: id, markah: markah });
    }
    
    newPelajarData.sort((a, b) => a.nama.localeCompare(b.nama));

    try {
        let kelas = await Kelas.findOne({ namaKelas: namaKelas });

        if (kelas) {
            kelas.pelajar = newPelajarData;
            await kelas.save();
        } else {
            kelas = new Kelas({ namaKelas: namaKelas, pelajar: newPelajarData });
            await kelas.save();
        }

        res.json({ message: 'Senarai pelajar berjaya dimuat naik dan disimpan!', kelasData: kelas });

    } catch (error) {
        if (error.code === 11000) { 
            res.status(409).send('Nama Kelas ini sudah wujud. Sila pilih dari dropdown atau guna nama lain.');
        } else {
            res.status(500).send('Ralat menyimpan senarai pelajar ke DB: ' + error.message);
        }
    }
});

// 5. Padam Kelas
app.delete('/api/kelas/:namaKelas', async (req, res) => {
    try {
        const namaKelas = req.params.namaKelas;
        
        if (!namaKelas) {
            return res.status(400).send('Nama kelas diperlukan.');
        }

        const result = await Kelas.findOneAndDelete({ namaKelas: namaKelas });
        
        if (!result) {
            return res.status(404).send('Kelas tidak ditemui.');
        }

        res.json({ message: 'Kelas berjaya dipadam!' });
    } catch (error) {
        console.error("Ralat memadam kelas:", error);
        res.status(500).send('Ralat memadam kelas: ' + error.message);
    }
});

// Mula Server
app.listen(PORT, () => {
    console.log(`Server Node.js berjalan di http://localhost:${PORT}`);
    console.log(`Akses aplikasi di http://localhost:${PORT}`);
});