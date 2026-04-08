
const firebaseConfig = {
    apiKey: "AIzaSyCwomuOoqcuQ9ULW4PzNhCyYq4tTJ11OTA",
    authDomain: "blood-bank-management-d972b.firebaseapp.com",
    projectId: "blood-bank-management-d972b",
    storageBucket: "blood-bank-management-d972b.appspot.com",
    messagingSenderId: "678483937815",
    appId: "1:678483937815:web:8a45dfd3b29179082d2a52"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let bloodData = [], requestsData = [], chartInstance = null, html5QrCode = null;
let inventoryTable, requestsTable;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    // Fixed: Only initialize if data is ready or tables don't exist
    if (!inventoryTable) initInventoryTable();
    if (!requestsTable) initRequestsTable();
    loadAllData();
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
        btn.addEventListener('click', (e) => navigate(e.target.dataset.page, e.target));
    });
    document.getElementById('entryDate').valueAsDate = new Date();
    updateUserInfo();
    Notification.requestPermission();
});

// ===== NAVIGATION =====
function navigate(pageId, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('pageTitle').textContent = btn.textContent.trim();

    if (pageId !== 'add') stopScanner();

    if (pageId === 'inventory' && !inventoryTable) initInventoryTable();
    if (pageId === 'requests' && !requestsTable) initRequestsTable();

    // 🔥 ADD THIS
    if (pageId === 'reports') initReports();
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
}

function logout() {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

// ===== AUTH =====
function handleLogin(e) {
    e.preventDefault();
    const uid = document.getElementById('u').value;
    const pwd = document.getElementById('p').value;
   
    if (uid === 'admin' && pwd === '1234') {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        loadAllData();
    } else {
        alert('❌ Invalid credentials!');
    }
}

function updateUserInfo() {
    document.getElementById('userInfo').textContent = `Admin | ${new Date().toLocaleDateString('en-IN')}`;
}

// ===== SCANNER =====
function switchIntakeMode(mode) {
    const manualBtn = document.getElementById('tabManual');
    const scannerBtn = document.getElementById('tabScanner');
    const scannerSection = document.getElementById('scannerSection');
   
    if (mode === 'scanner') {
        scannerBtn.classList.add('active');
        manualBtn.classList.remove('active');
        scannerSection.style.display = 'block';
        setTimeout(startScanner, 300);
    } else {
        manualBtn.classList.add('active');
        scannerBtn.classList.remove('active');
        scannerSection.style.display = 'none';
        stopScanner();
    }
}

function startScanner() {
    if (html5QrCode) return;
    html5QrCode = new Html5Qrcode('reader');
   
    const config = {
        fps: 20, // Faster frame rate
        qrbox: { width: 280, height: 280 }, // Adjusted box
        aspectRatio: 1.0
    };

    html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
            const bagInput = document.getElementById('bagNo');
            if (bagInput) {
                bagInput.value = decodedText.trim().toUpperCase(); //
            }
           
            document.getElementById('scanStatus').innerHTML =
                `<b style="color: #4caf50;">✅ Bag ID Captured: ${decodedText}</b>`;
           
            setTimeout(() => {
                stopScanner();
                switchIntakeMode('manual');
                document.getElementById('dName').focus(); //
            }, 800);
        },
        (errorMessage) => { }
    ).catch(err => {
        document.getElementById('scanStatus').textContent = '⚠️ Camera blocked or unavailable.';
    });
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => html5QrCode = null).catch(() => {});
    }
}

// ===== DATA =====
function loadAllData() {
    if (!db) return;

    function updateTable(tableVar, data) {
        if (tableVar) {
            tableVar.clear();
            tableVar.rows.add(data);
            tableVar.draw();
        }
    }
//---------------------------------------------------------database integration-----------------------------//
    db.collection('bloodInventory')
      .orderBy('timestamp', 'desc')
      .onSnapshot(snapshot => {
          bloodData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          updateDashboard(); // Fixed: Ensure dashboard updates on snapshot
          updateTable(inventoryTable, bloodData);
      }, err => console.error(err));

    db.collection('bloodRequests')
      .orderBy('timestamp', 'desc')
      .onSnapshot(snapshot => {
          requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          updateTable(requestsTable, requestsData);
      }, err => console.error(err));
}

async function addBlood() {
    const required = ['dName', 'bagNo', 'bloodgroup', 'hb', 'entryDate'];
    for (let id of required) {
        if (!document.getElementById(id).value) return alert('❌ All required fields must be filled!');
    }

    const hbValue = parseFloat(document.getElementById('hb').value); //
    if (hbValue < 12 || hbValue > 18) return alert('❌ Hb must be 12-18 g/dL');

    const unit = {
        donorId: document.getElementById('donorId').value || `DONOR_${Date.now().toString().slice(-8)}`,
        name: document.getElementById('dName').value,
        bag: document.getElementById('bagNo').value.trim().toUpperCase(),
        group: document.getElementById('bloodgroup').value,
        ageSex: document.getElementById('ageSex').value,
        weight: document.getElementById('weight').value,
        bp: document.getElementById('bp').value,
        hb: hbValue, // Saved as number
        quantity: parseInt(document.getElementById('quantity').value) || 450,
        date: document.getElementById('entryDate').value,
        status: 'SAFE',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
//----------------------------------DATABASE STORED------------//
    try {
      await db.collection('bloodInventory').add(unit);
        alert('✅ Unit added successfully!');
        resetAddForm();
        generateBagLabel(unit);
    } catch (err) {
        alert('❌ Error: ' + err.message);
    }
}

function resetAddForm() {
    document.querySelectorAll('#add input, #add select').forEach(el => el.value = '');
    document.getElementById('entryDate').valueAsDate = new Date();
}

// ===== DASHBOARD =====
function updateDashboard() {
    const today = new Date();
    let total = bloodData.length, expired = 0, lowStockGroups = 0;
    const stats = {};

    bloodData.forEach(item => {
        // Fixed: Date handling to prevent NaN
        const d = item.date ? new Date(item.date) : new Date();
        const expiryDate = new Date(d.getTime() + 35 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((expiryDate - today) / (24 * 60 * 60 * 1000));
       
        item.daysLeft = isNaN(daysLeft) ? 0 : daysLeft; //
        item.expiryDate = expiryDate.toLocaleDateString('en-IN');
       
        if (item.daysLeft <= 0) {
            item.status = 'EXPIRED';
            expired++;
        } else if (item.daysLeft <= 3) {
            item.status = 'CRITICAL';
        } else if (item.daysLeft <= 7) {
            item.status = 'LOW';
        } else {
            item.status = 'SAFE';
        }
       
        if (item.group) stats[item.group] = (stats[item.group] || 0) + 1;
    });

    Object.values(stats).forEach(count => { if (count < 3) lowStockGroups++; });

    document.getElementById('totalUnits').textContent = isNaN(total) ? 0 : total; //
    document.getElementById('expiredUnits').textContent = expired;
    document.getElementById('lowStock').textContent = lowStockGroups;
    updateChart(stats);
}

// ===== PIE CHART =====
function updateChart(stats) {
    const canvas = document.getElementById('bloodChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();
   
    chartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                data: Object.values(stats),
                backgroundColor: ['#a70404', '#d32f2f', '#ff5722', '#ff9800', '#01c6c6', '#4caf50', '#9c27b0', '#607d8b'],
                borderColor: '#ffffff',
                borderWidth: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 14 } } }
            }
        }
    });
}          
// ===== TABLES =====
function initInventoryTable() {
    if ($.fn.DataTable.isDataTable('#inventoryTable')) return;
   
    inventoryTable = $('#inventoryTable').DataTable({
        data: bloodData,
        responsive: true,
        pageLength: 25,
        columns: [
            { data: 'bag', defaultContent: "" },
            { data: 'name', defaultContent: "N/A" },
            { data: 'group', defaultContent: "" },
            { data: 'hb', defaultContent: "0" },
            { data: 'expiryDate', defaultContent: "" },
            { data: 'daysLeft', defaultContent: "0" },
            { data: 'status', defaultContent: "UNKNOWN" }
        ]
    });
}
function initRequestsTable() {
    if ($.fn.DataTable.isDataTable('#requestsTable')) return;
   
    requestsTable = $('#requestsTable').DataTable({
        data: requestsData,
        responsive: true,
        pageLength: 25,
        order: [[5, 'desc']],
        columns: [
            { data: 'patient', defaultContent: "Unknown" },
            { data: 'group', defaultContent: "" },
            { data: 'units', defaultContent: "0" },
            { data: 'priority', defaultContent: "Normal" },
            { data: 'status', defaultContent: "Pending" },
            {
                data: 'timestamp',
                defaultContent: "",
                render: data => data ? data.toDate().toLocaleDateString('en-IN') : ''
            },
            {
                data: null, // Index 6: Set to null as it is a manual button
                defaultContent: "",
                orderable: false,
                render: (data, type, row) =>
                    row.status === 'Pending' ?
                    `<button class="btn-mini" style="background:#2196f3" onclick="issueRequest('${row.id}')">Issue</button>` :
                    '✓ Completed'
            }
        ]
    });
}

// Global scope fix for issueRequest
window.issueRequest = async function(reqId) {
    await db.collection('bloodRequests').doc(reqId).update({ status: 'Issued' });
    alert('✅ Blood issued!');
};

// ... Rest of your side-menu toggle and export functions remain the same

function initRequestsTable() {
    if ($.fn.DataTable.isDataTable('#requestsTable')) return;
   
    requestsTable = $('#requestsTable').DataTable({
        data: requestsData,
        responsive: true,
        pageLength: 25,
        order: [[5, 'desc']],
        columns: [
            { data: 'patient', defaultContent: "Unknown" },
            { data: 'group', defaultContent: "" },
            { data: 'units', defaultContent: "0" },
            { data: 'priority', defaultContent: "Normal" },
            { data: 'status', defaultContent: "Pending" },
            {
                data: 'timestamp',
                defaultContent: "",
                render: data => data ? data.toDate().toLocaleDateString('en-IN') : ''
            },
            {
                data: null, // Index 6: Set to null as it is a manual button
                defaultContent: "",
                orderable: false,
                render: (data, type, row) =>
                    row.status === 'Pending' ?
                    `<button class="btn-mini" style="background:#2196f3" onclick="issueRequest('${row.id}')">Issue</button>` :
                    '✓ Completed'
            }
        ]
    });
}

// ===== REQUESTS =====
async function submitRequest() {
    const required = ['reqPatient', 'reqGroup', 'reqUnits'];
    for (let id of required) {
        if (!document.getElementById(id).value) return alert('❌ Required fields missing!');
    }

    const request = {
        patient: document.getElementById('reqPatient').value,
        group: document.getElementById('reqGroup').value,
        units: parseInt(document.getElementById('reqUnits').value),
        priority: document.getElementById('reqPriority').value,
        notes: document.getElementById('reqNotes').value,
        status: 'Pending',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
//-------------- database integration--------//
    try {
        await db.collection('bloodRequests').add(request);
        alert('✅ Request submitted successfully!');
        document.getElementById('reqPatient').value = '';
        document.getElementById('reqGroup').value = '';
        document.getElementById('reqUnits').value = '';
    } catch (err) {
        alert('❌ Error: ' + err.message);
    }
}

async function issueRequest(reqId) {
    await db.collection('bloodRequests').doc(reqId).update({ status: 'Issued' });
    alert('✅ Blood issued! Stock updated.');
}

// ===== LABELS & EXPORTS =====
function generateBagLabel(unit) {
    const { jsPDF } = window.jspdf.jsPDF;
    const doc = new jsPDF();
   
    doc.setFillColor(167, 4, 4);
    doc.rect(0, 0, 210, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('BLOOD BAG LABEL', 20, 12);
   
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text(`Bag No: ${unit.bag}`, 20, 35);
    doc.text(`Blood Group: ${unit.group}`, 20, 50);
    doc.text(`Donor: ${unit.name}`, 20, 65);
   
    const expiryDate = new Date(new Date(unit.date).getTime() + 35 * 24 * 60 * 60 * 1000);
    doc.text(`Expiry: ${expiryDate.toLocaleDateString('en-IN')}`, 20, 80);
   
    const qrDiv = document.createElement('div');
    new QRCode(qrDiv, {
        text: JSON.stringify({ bag: unit.bag, group: unit.group, expiry: expiryDate.toISOString() }),
        width: 80, height: 80, colorDark: '#a70404'
    });
   
    setTimeout(() => {
        doc.addImage(qrDiv.querySelector('canvas').toDataURL(), 'PNG', 120, 25, 70, 70);
        doc.save(`${unit.bag}_LABEL.pdf`);
    }, 100);
}

function printLabel(bagNo) {
    const unit = bloodData.find(u => u.bag === bagNo);
    if (unit) generateBagLabel(unit);
    else alert('Label not found!');
}

function printAllLabels() {
    bloodData.forEach(unit => generateBagLabel(unit));
}
//-----------------------------------excel sheet-------------------------------------------//

function exportToExcel() {
    const ws = XLSX.utils.json_to_sheet(bloodData.map(({ id, ...rest }) => rest));
    XLSX.writeFile({ SheetNames: ['Blood Inventory'], Sheets: { 'Blood Inventory': ws } }, 'BBM_Inventory.xlsx');
}

function checkAlerts() {
    const alerts = bloodData.filter(item => item.status === 'LOW' || item.status === 'CRITICAL');
    if (alerts.length) {
        if (Notification.permission === 'granted') {
            new Notification('🚨 BLOOD STOCK ALERT', {
                body: `${alerts.length} units low/critical: ${alerts.map(l => l.group).join(', ')}`
            });
        }
        alert(`🚨 ${alerts.length} alerts!\n${alerts.map(a => `${a.group}: ${a.daysLeft} days`).join('\n')}`);
    } else {
        alert('✅ All stocks are safe!');
    }
}






function showSection(sectionId) {

    const sections = [
        "dashboardSection",
        "inventorySection",
        "requestSection",
        "reportsSection"
    ];

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    const active = document.getElementById(sectionId);
    if (active) active.style.display = "block";
}

function toggleMenu() {

    const sidebar = document.querySelector(".sidebar");
    const main = document.querySelector(".main-content");

    sidebar.classList.toggle("hidden");
    main.classList.toggle("full");

}

document.addEventListener("click", function (event) {

    const sidebar = document.querySelector(".sidebar");
    const main = document.querySelector(".main-content");
    const menuBtn = document.querySelector(".menu-btn");

    // If sidebar is open
    if (!sidebar.classList.contains("hidden")) {

        // If click is NOT inside sidebar AND NOT on menu button
        if (!sidebar.contains(event.target) && !menuBtn.contains(event.target)) {

            sidebar.classList.add("hidden");
            main.classList.add("full");
        }
    }

});



function initReports() {

    const today = new Date().toISOString().split('T')[0];

    // Count Added Today
    db.collection('inventory')
      .where('date', '==', today)
      .get()
      .then(snapshot => {
          document.getElementById('addedToday').textContent = snapshot.size;
      });

    // Count Issued Today
    db.collection('inventory')
      .where('issuedDate', '==', today)
      .get()
      .then(snapshot => {
          document.getElementById('issuedToday').textContent = snapshot.size;
      });

    // Count Total Requests
    db.collection('requests')
      .get()
      .then(snapshot => {
          document.getElementById('totalRequests').textContent = snapshot.size;
      });

    loadAuditTable();
}


function loadAuditTable() {

    if ($.fn.DataTable.isDataTable('#auditTable')) {
        $('#auditTable').DataTable().destroy();
    }

    $('#auditTable').DataTable({
        ajax: async function (data, callback) {
            const snapshot = await db.collection('logs')
                                     .orderBy('timestamp', 'desc')
                                     .limit(100)
                                     .get();

            const rows = snapshot.docs.map(doc => doc.data());

            callback({ data: rows });
        },
        columns: [
            { data: 'action' },
            { data: 'details' },
            {
                data: 'timestamp',
                render: data => data?.toDate().toLocaleString() || ''
            },
            { data: 'user' }
        ]
    });
}
