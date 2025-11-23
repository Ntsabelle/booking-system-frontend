// app.js

// -----------------------------
// Global State for Pagination
// -----------------------------
var allAppointments = [];
var currentPage = 1;
var pageSize = 5;
var flatpickrInstance = null;
// -----------------------------
// Time helpers & normalization
// -----------------------------
function pad(n){ return n.toString().padStart(2,'0'); }
function to24(slotDisplay){ // "9:00 AM" or "09:00 AM" -> "09:00"
  var m = String(slotDisplay).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if(!m) return slotDisplay; // Ensure we return the original if no match
  var h = parseInt(m[1],10);
  var mm = m[2];
  var ampm = m[3].toUpperCase();
  if(ampm === 'PM' && h !== 12) h += 12;
  if(ampm === 'AM' && h === 12) h = 0;
  return pad(h) + ':' + mm;
}


function from24ToDisplay(t24){ // "09:00" -> "9:00 AM"
  var parts = String(t24).split(':');
  var h = parseInt(parts[0],10);
  var m = parts[1] || '00';
  var ampm = h < 12 ? 'AM' : 'PM';
  var hd = h % 12 || 12;
  return hd + ':' + m.toString().padStart(2,'0') + ' ' + ampm;
}

// -----------------------------
// Load Branches on Page Load
// -----------------------------
function loadBranches() {
    document.getElementById('spinner').style.display = 'block'; // show spinner

    fetch('http://localhost:8080/api/branches')
        .then(async function (res) {
            console.log("Response status:", res.status);
            var contentType = res.headers.get('content-type');
            var data = contentType && contentType.includes('application/json')
                ? await res.json()
                : [];
            console.log("Branch response:", data);
            var branchSelect = document.getElementById('branch');
            branchSelect.innerHTML = '<option value="">Select Branch</option>';

            data.forEach(function (branch) {
                var option = document.createElement('option');
                option.value = branch;
                option.textContent = branch;
                branchSelect.appendChild(option);
            });
        })
        .catch(function (err) {
            document.getElementById('branch').innerHTML =
                '<option value="">Error loading branches</option>';
            console.error('Branch load error:', err.message);
        })
        .finally(function () {
            document.getElementById('spinner').style.display = 'none'; // hide spinner
        });
}

// -----------------------------
// Admin auth (server-backed)
// -----------------------------
// Retrieve the stored admin token from sessionStorage
function getToken() {
  return sessionStorage.getItem('adminToken') || null;
}

// Save or remove the admin token in sessionStorage
function setToken(t) {
  if (t) sessionStorage.setItem('adminToken', t);
  else sessionStorage.removeItem('adminToken');
}

// Check if an admin is currently logged in (token exists)
function isAdmin() {
  return !!getToken();
}

// Update the admin UI based on login state
function updateAdminUI() {
  const sec = document.getElementById('adminSection');   // Section visible only to admin
  const loginBtn = document.getElementById('adminLogin'); // Login button
  const logoutBtn = document.getElementById('adminLogout'); // Logout button
  const msg = document.getElementById('adminMsg');       // Status message

  if (!sec) return; // If admin section not found, exit

  if (isAdmin()) {
    // Show admin section and logout button, hide login button
    sec.style.display = '';
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = '';
    if (msg) msg.textContent = ' (admin)';
  } else {
    // Hide admin section, show login button, hide logout button
    sec.style.display = 'none';
    if (loginBtn) loginBtn.style.display = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (msg) msg.textContent = '';
  }
}

// Handle admin login request
async function adminLogin() {
  const pwdEl = document.getElementById('adminPwd'); // Password input field
  const pwd = pwdEl ? pwdEl.value : '';
  document.getElementById('spinner').style.display = 'block'; // Show loading spinner

  try {
    // Send login request to backend
    const r = await safeFetch('http://localhost:8080/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });

    // If login failed, throw error with message
    if (!r.ok) {
      const msg = r.error || r.text || (r.data && r.data.message) || 'Login failed';
      throw new Error(msg);
    }

    // If login succeeded, store token and update UI
    const data = r.data || {};
    if (data && data.token) {
      setToken(data.token);
      updateAdminUI();
      showToast('Admin login successful');
    } else {
      throw new Error('No token returned');
    }
  } catch (err) {
    // Show error toast and log error
    showToast('Admin login failed: ' + err.message, true);
    console.error('Admin login error:', err);
  } finally {
    // Hide spinner regardless of success/failure
    document.getElementById('spinner').style.display = 'none';
  }
}

// Handle admin logout
function adminLogout() {
  setToken(null); // Remove token
  updateAdminUI(); // Update UI to logged-out state
  var pwdEl = document.getElementById('adminPwd');
  if (pwdEl) pwdEl.value = ''; // Clear password field
  showToast('Logged out');
}

// Setup event listeners once DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const adminLoginBtn = document.getElementById('adminLogin');
  const adminLogoutBtn = document.getElementById('adminLogout');

  if (adminLoginBtn) adminLoginBtn.addEventListener('click', adminLogin);
  if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', adminLogout);

  // Initialize UI based on current login state
  updateAdminUI();
});


function getAuthHeader(){ const t = getToken(); return t ? { 'Authorization': 'Bearer ' + t } : {}; }

// -----------------------------
// Booking Form Validation Logic
// -----------------------------
function validateBookingForm() {
  var name = document.getElementById('customerName').value.trim();
  var branch = document.getElementById('branch').value;
  var date = document.getElementById('date').value;
  var timeSlot = document.getElementById('timeSlot').value;
  var email = document.getElementById('email').value.trim();
  var cellphone = document.getElementById('cellphone').value.trim();

  var isValid = name && branch && date && timeSlot && email && cellphone;
  document.getElementById('bookBtn').disabled = !isValid;
}


// Attach validation listeners to form fields
['customerName', 'branch', 'date', 'timeSlot', 'email', 'cellphone'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', validateBookingForm);
});

// -----------------------------
// Booking Form Submission Logic
// -----------------------------
// Attach submit handler to the booking form
document.getElementById('bookingForm').addEventListener('submit', async function (e) {
  e.preventDefault(); // Prevent default form submission (page reload)

  // Collect and trim input values
  var name = document.getElementById('customerName').value.trim();
  var branch = document.getElementById('branch').value;
  var date = document.getElementById('date').value;
  var timeSlot = document.getElementById('timeSlot').value.trim();

  // Basic validation: ensure all required fields are filled
  if (!name || !branch || !date || !timeSlot) {
    document.getElementById('response').innerText = 'Please fill in all fields.';
    return;
  }

  // Build appointment object to send to backend
  var appointment = {
    customerName: name,
    branch: branch,
    date: date,
    timeSlot: timeSlot,
    email: document.getElementById('email').value.trim(),
    cellphone: document.getElementById('cellphone').value.trim()
  };

  // Show loading spinner while request is in progress
  document.getElementById('spinner').style.display = 'block';
  try {
    // Send POST request to backend to create appointment
    const r = await safeFetch('http://localhost:8080/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appointment)
    });

    // If booking succeeded (HTTP 201 Created)
    if (r.ok && r.status === 201) {
      const data = r.data || {};
      showToast('Appointment booked successfully!');
      document.getElementById('response').innerText = 'Confirmation Code: ' + (data.confirmationCode || '');
      document.getElementById('bookingForm').reset(); // Clear form fields

      // Invalidate cached time slots for this branch/date and reload
      delete timeSlotCache[branch + '_' + date];
      loadAvailableTimeSlots();
      validateBookingForm();
    } else {
      // Handle error response from backend
      const msg = r.text || (r.data && r.data.message) || friendlyMessage(r.status, r.text);
      showToast(msg, true);
      document.getElementById('response').innerText = msg;

      // Special handling for conflict (409): time slot already taken
      if (r.status === 409) {
        var tsEl = document.getElementById('timeSlot');
        if (tsEl) tsEl.classList.add('error'); // Highlight time slot field
        loadAvailableTimeSlots(); // Refresh available slots
      }
    }
  } catch (err) {
    // Handle network or unexpected errors
    showToast('Error: ' + err.message, true);
    document.getElementById('response').innerText = 'Error: ' + err.message;
  } finally {
    // Hide spinner regardless of success or failure
    document.getElementById('spinner').style.display = 'none';
  }
});


// -----------------------------
// Lookup Form Submission Logic
// -----------------------------
document.getElementById('lookupForm').addEventListener('submit', function (e) {
  e.preventDefault();
  if (!isAdmin()){ showToast('Admin access required', true); return; }

  var code = document.getElementById('confirmationCode').value.trim();
  var resultDiv = document.getElementById('lookupResult');
  resultDiv.innerText = '';
  document.getElementById('spinner').style.display = 'block';

  fetch('http://localhost:8080/api/appointments/' + code, { headers: getAuthHeader() })
    .then(async function (res) {
      if (res.status === 401) { setToken(null); updateAdminUI(); showToast('Session expired', true); return; }
      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')){
        try {
          data = await res.json();
        } catch (err){
          // invalid JSON — fall back to text for clearer message
          const txt = await res.text().catch(()=>null);
          const msg = txt || ('Invalid JSON response: ' + err.message);
          showToast(msg, true);
          resultDiv.innerText = msg;
          return;
        }
      } else {
        // not JSON, read raw text
        data = await res.text().catch(()=>null);
      }

      if (res.ok) {
        if (typeof data === 'string'){
          // server returned plain text even on success
          showToast(data);
          resultDiv.innerText = data;
        } else {
          showToast('Appointment found!');
          renderAppointmentsTable([data], 'appointmentsTable');
          document.getElementById('lookupForm').reset();
          document.getElementById('appointmentsTable').scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        const msg = typeof data === 'string' ? data : JSON.stringify(data || {});
        showToast(msg || 'Lookup failed', true);
        resultDiv.innerText = msg || 'Lookup failed';
      }
    })
    .catch(function (err) {
      showToast('Error: ' + err.message, true);
      resultDiv.innerText = 'Error: ' + err.message;
    })
    .finally(function () {
      document.getElementById('spinner').style.display = 'none';
    });
});

function renderAppointmentsTable(data, tableId) {
  var table = document.getElementById(tableId);
  var tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  data.forEach(appt => {
    var row = document.createElement('tr');
    ['customerName','branch','date','timeSlot','confirmationCode','email','cellphone'].forEach(key => {
      var td = document.createElement('td');
      td.textContent = appt[key] || '';
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });

  table.style.display = 'table';
}


function renderPagination(totalItems) {
    var totalPages = Math.ceil(totalItems / pageSize);
    var container = document.getElementById('pagination');
    container.innerHTML = '';

    for (var i = 1; i <= totalPages; i++) {
        var btn = document.createElement('button');
        btn.textContent = i;
        btn.disabled = i === currentPage;
        btn.addEventListener('click', function () {
            currentPage = parseInt(this.textContent);
            applyFilter();
        });
        container.appendChild(btn);
    }
}

function applyFilter() {
    var query = document.getElementById('filterInput').value.toLowerCase();
    var filtered = allAppointments.filter(function (a) {
        return (
            a.customerName.toLowerCase().includes(query) ||
            a.branch.toLowerCase().includes(query)
        );
    });
   var start = (currentPage - 1) * pageSize;
   var pageData = filtered.slice(start, start + pageSize);
   renderAppointmentsTable(pageData, 'appointmentsTable');
   renderPagination(filtered.length);
}

function showToast(message, isError = false) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + (isError ? 'error' : 'success');
    setTimeout(() => toast.className = 'toast', 3000);
}

//Add Time Slot Generator 
function generateTimeSlots(start = "09:00", end = "16:30", interval = 30){
  // Generate exactly the 16 half-hour slots between 09:00 and 16:30 inclusive
  const slots = [];
  let hour = 9, minute = 0;
  for (let i = 0; i < 16; i++){
    slots.push(pad(hour) + ':' + pad(minute));
    minute += interval;
    if (minute >= 60){ minute -= 60; hour += 1; }
  }
  return slots;
}

const timeSlotCache = {};

// Load Available Time Slots Based on Branch and Date
function loadAvailableTimeSlots() {
  const branch = document.getElementById('branch').value;
  const date = document.getElementById('date').value;
  const cacheKey = `${branch}_${date}`;
  const timeSlotSelect = document.getElementById('timeSlot');

  if (!branch || !date) {
    timeSlotSelect.innerHTML = '<option value="">Select a time slot</option>';
    timeSlotSelect.disabled = true;
    validateBookingForm();
    return;
  }

  if (timeSlotCache[cacheKey]) {
  // recompute availability from cached booked slots in case server data changed
  const cached = timeSlotCache[cacheKey];
  const allSlots = generateTimeSlots();
  const availableFromCache = allSlots.filter(slot => !((cached && cached.booked) || []).includes(slot));
  renderTimeSlots(availableFromCache);
  return;
  }

  document.getElementById('dropdownSpinner').style.display = 'inline-block';

  fetch(`http://localhost:8080/api/appointments?branch=${branch}&date=${date}`)
    .then(async res => {
      const booked = await res.json();
      // Normalize server time strings to canonical 24h "HH:MM"
      const extractTime = entry => {
        if (!entry) return '';
        if (typeof entry === 'string') return entry.trim();
        // try common property names
        const candidates = ['timeSlot','time','slot','appointmentTime','startTime','appointment_time','start_time'];
        for (const k of candidates){
          if (entry[k]) return String(entry[k]).trim();
        }
        // try to find any string-valued prop
        for (const k in entry){
          if (typeof entry[k] === 'string') return entry[k].trim();
        }
        return '';
      };

      const bookedSlots = Array.from(new Set((booked || []).map(a => {
        const ts = extractTime(a);
        if (!ts) return '';
        if (/AM|PM/i.test(ts)) return to24(ts);
        // handle HH:MM or HH:MM:SS
        const m = ts.match(/(\d{1,2}):(\d{2})/);
        if (m) return pad(parseInt(m[1],10)) + ':' + m[2];
        return ts;
      }).filter(Boolean)));

      const allSlots = generateTimeSlots();
      const available = allSlots.filter(slot => !bookedSlots.includes(slot));

  // cache booked slots (source of truth) and available list
  timeSlotCache[cacheKey] = { booked: bookedSlots, available: available };
  renderTimeSlots(available);
    })
    .catch(err => {
      showToast('Error loading time slots: ' + err.message, true);
    })
    .finally(() => {
      document.getElementById('dropdownSpinner').style.display = 'none';
    });
}

function renderTimeSlots(available){
  const timeSlotSelect = document.getElementById('timeSlot');
  timeSlotSelect.innerHTML = '';
  timeSlotSelect.disabled = true;
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a time slot';
  timeSlotSelect.appendChild(defaultOption);

  if (available.length === 0){
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No slots available';
    timeSlotSelect.appendChild(option);
  } else {
    available.forEach(t24 => {
      const option = document.createElement('option');
      option.value = t24;
      option.textContent = from24ToDisplay(t24);
      timeSlotSelect.appendChild(option);
    });
    timeSlotSelect.disabled = false;
  }
  validateBookingForm();
}



// Attach listeners to branch and date fields to load time slots
['branch'].forEach(id => {
  document.getElementById(id).addEventListener('change', loadAvailableTimeSlots);
});

function updateDatePicker(branch) {
  fetch(`http://localhost:8080/api/appointments/fully-booked?branch=${branch}`)
    .then(async res => {
      const fullyBooked = await res.json(); // array of ISO dates
      console.log("Fully booked dates:", fullyBooked);
      // Destroy previous instance if exists
      if (flatpickrInstance) {
        flatpickrInstance.destroy();
      }

      // normalize fullyBooked dates to YYYY-MM-DD strings
      const disabledDates = (fullyBooked || []).map(d => {
        // accept Date objects or ISO strings
        if (!d) return d;
        if (typeof d === 'string') return d.split('T')[0];
        if (d instanceof Date) return d.toISOString().split('T')[0];
        return String(d).split('T')[0];
      }).filter(Boolean);

      flatpickrInstance = flatpickr("#date", {
        dateFormat: "Y-m-d",
        minDate: 'today',
        disable: disabledDates,
        onChange: function(selectedDates, dateStr){
          // dateStr is YYYY-MM-DD now
          loadAvailableTimeSlots();
        }
      });
    })
    .catch(err => showToast('Error loading booked dates: ' + err.message, true));
}

document.getElementById('branch').addEventListener('change', function () {
  const branch = this.value;
  if (branch) updateDatePicker(branch);
});


// -----------------------------
// Load All Appointments Button
// -----------------------------
document.getElementById('loadAppointments').addEventListener('click', function () {
  if (!isAdmin()){ showToast('Admin access required', true); return; }
  document.getElementById('spinner').style.display = 'block'; // show spinner

  fetch('http://localhost:8080/api/appointments', { headers: getAuthHeader() })
        .then(async function (res) {
      if (res.status === 401){ setToken(null); updateAdminUI(); showToast('Session expired', true); return; }
      allAppointments = await res.json();
            currentPage = 1;
            applyFilter();
        })
        .catch(function (err) {
            alert('Error loading appointments: ' + err.message);
        })
        .finally(function () {
            document.getElementById('spinner').style.display = 'none'; // hide spinner
        });
});

// -----------------------------
// Filter Input Listener
// -----------------------------
document.getElementById('filterInput').addEventListener('input', function () {
    currentPage = 1;
    applyFilter();
});

// -----------------------------
// Minimal safe fetch that adds auth header, parses JSON/text, handles 401 centrally
// -----------------------------
async function safeFetch(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers || {}, getAuthHeader());
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    // network or CORS error
    return { ok: false, status: 0, error: 'Network error: ' + err.message };
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  let data = null, text = null;
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch (err) {
      text = await res.text();
      console.error('JSON parse error:', err, 'Response text:', text);
      throw new Error('Invalid JSON response from server');
    }
  } else {
    text = await res.text();
  }

  if (res.status === 401) {
    // Unauthorized — clear token and notify
    setToken(null);
    updateAdminUI();
    return { ok: false, status: 401, error: 'Session expired' };
  }

  return { ok: res.ok, status: res.status, data: data, text: text, error: null };
}

function friendlyMessage(status, dataText) {
  if (status === 404) return 'Not found';
  if (status === 401) return 'Please login as admin to perform this action';
  if (status === 409) return dataText || 'Conflict: resource already exists';
  return (dataText || 'Request failed');
}
