// ===================================================================
// CitizenReport - main app logic
// Plain JavaScript, no framework - built for Cordova + WordPress REST API
// ===================================================================

// ----- App state kept in memory (and mirrored to localStorage for login) -----
let currentUser = {
  token: localStorage.getItem("cr_token") || null,
  displayName: localStorage.getItem("cr_displayName") || null,
  userId: localStorage.getItem("cr_userId") || null,
};

let capturedPhotoBase64 = null; // set after Take Photo
let capturedLocation = null; // { lat, lng }
let categoriesCache = []; // [{id, name}]

// Wait for Cordova to be ready before touching camera/geolocation/notification plugins.
// If cordova.js isn't present (e.g. testing in a plain browser), fall back gracefully.
document.addEventListener("deviceready", initApp, false);
if (!window.cordova) {
  document.addEventListener("DOMContentLoaded", initApp, false);
}

function initApp() {
  setupNavigation();
  updateUserStatusDisplay();
  loadCategories();
  setupLoginScreen();
  setupAddScreen();
  setupBrowseScreen();
  startPostPolling();
}

// ===================================================================
// NAVIGATION (simple show/hide tabs)
// ===================================================================
function setupNavigation() {
  const navButtons = document.querySelectorAll(".nav-btn");
  navButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      showScreen(btn.getAttribute("data-screen"));
    });
  });
  // Default screen
  showScreen(currentUser.token ? "browseScreen" : "loginScreen");
}

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(function (s) {
    s.classList.remove("active");
  });
  document.getElementById(screenId).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-screen") === screenId);
  });

  if (screenId === "browseScreen") {
    loadIncidents();
  }
}

function updateUserStatusDisplay() {
  const el = document.getElementById("userStatus");
  el.textContent = currentUser.displayName
    ? "Logged in as " + currentUser.displayName
    : "Not logged in (guest)";
}

// ===================================================================
// FEATURE 8: LOGIN (WordPress JWT Authentication)
// ===================================================================
function setupLoginScreen() {
  document.getElementById("loginBtn").addEventListener("click", function () {
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;
    const msg = document.getElementById("loginMessage");

    if (!username || !password) {
      msg.textContent = "Please enter both username and password.";
      return;
    }

    msg.textContent = "Logging in...";

    fetch(APP_CONFIG.WP_BASE_URL + APP_CONFIG.ENDPOINTS.LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.token) {
          currentUser.token = data.token;
          currentUser.displayName = data.user_display_name || username;
          // Note: the standard JWT Auth plugin does not return the numeric
          // user ID directly. If you need author filtering to work precisely,
          // install "JWT Authentication for WP-API" + enable the
          // user id field, or fetch /wp-json/wp/v2/users/me with the token.
          fetchCurrentUserId(data.token);

          localStorage.setItem("cr_token", currentUser.token);
          localStorage.setItem("cr_displayName", currentUser.displayName);

          msg.textContent = "Logged in successfully!";
          updateUserStatusDisplay();
          setTimeout(function () {
            showScreen("addScreen");
          }, 600);
        } else {
          msg.textContent = data.message || "Login failed. Check your credentials.";
        }
      })
      .catch(function (err) {
        msg.textContent = "Could not reach the server. Check your internet connection.";
        console.error(err);
      });
  });

  document.getElementById("skipLoginBtn").addEventListener("click", function () {
    showScreen("addScreen");
  });
}

// Get the logged-in user's numeric ID so "My Incidents" filtering works.
function fetchCurrentUserId(token) {
  fetch(APP_CONFIG.WP_BASE_URL + "/wp-json/wp/v2/users/me", {
    headers: { Authorization: "Bearer " + token },
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data.id) {
        currentUser.userId = data.id;
        localStorage.setItem("cr_userId", data.id);
      }
    })
    .catch(function (err) {
      console.error("Could not fetch user id", err);
    });
}

// ===================================================================
// FEATURE 5: CATEGORIES (Accident, Fighting, Rioting, etc.)
// ===================================================================
function loadCategories() {
  fetch(APP_CONFIG.WP_BASE_URL + APP_CONFIG.ENDPOINTS.CATEGORIES + "?per_page=50")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!Array.isArray(data)) return;
      categoriesCache = data.map(function (c) {
        return { id: c.id, name: c.name };
      });
      populateCategorySelect("incidentCategory", false);
      populateCategorySelect("filterCategory", true);
    })
    .catch(function (err) {
      console.error("Could not load categories", err);
    });
}

function populateCategorySelect(selectId, includeAllOption) {
  const select = document.getElementById(selectId);
  select.innerHTML = "";

  if (includeAllOption) {
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Categories";
    select.appendChild(allOpt);
  }

  categoriesCache.forEach(function (cat) {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    select.appendChild(opt);
  });
}

// ===================================================================
// FEATURE 1, 6, 7: ADD NEW INCIDENT (with geolocation + photo)
// ===================================================================
function setupAddScreen() {
  document.getElementById("getLocationBtn").addEventListener("click", captureLocation);
  document.getElementById("takePhotoBtn").addEventListener("click", capturePhoto);
  document.getElementById("submitIncidentBtn").addEventListener("click", submitIncident);
}

// FEATURE 6: Geolocation - latitude & longitude of the incident
function captureLocation() {
  const display = document.getElementById("locationDisplay");
  display.textContent = "Getting location...";

  if (!navigator.geolocation) {
    display.textContent = "Geolocation not supported on this device.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      capturedLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      display.textContent =
        "Lat: " + capturedLocation.lat.toFixed(5) + ", Lng: " + capturedLocation.lng.toFixed(5);
    },
    function (error) {
      display.textContent = "Could not get location (" + error.message + ")";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// FEATURE 7: Photo of the incident (Cordova Camera plugin)
function capturePhoto() {
  if (!navigator.camera) {
    document.getElementById("addMessage").textContent =
      "Camera plugin not available (are you running this in a browser instead of on device?).";
    return;
  }

  navigator.camera.getPicture(
    function onSuccess(imageData) {
      capturedPhotoBase64 = imageData; // base64-encoded JPEG string
      const preview = document.getElementById("photoPreview");
      preview.src = "data:image/jpeg;base64," + imageData;
      preview.style.display = "block";
    },
    function onFail(message) {
      console.error("Camera error: " + message);
    },
    {
      quality: 60,
      destinationType: Camera.DestinationType.DATA_URL,
      sourceType: Camera.PictureSourceType.CAMERA,
      encodingType: Camera.EncodingType.JPEG,
      correctOrientation: true,
    }
  );
}

// FEATURE 1 + 3: Submit incident -> creates a new WordPress post automatically
function submitIncident() {
  const title = document.getElementById("incidentTitle").value.trim();
  const categoryId = document.getElementById("incidentCategory").value;
  const description = document.getElementById("incidentDescription").value.trim();
  const msg = document.getElementById("addMessage");

  if (!title || !description || !categoryId) {
    msg.textContent = "Please fill in the title, category, and description.";
    return;
  }

  msg.textContent = "Submitting...";

  // Build the post content. Location is appended into the content itself
  // to keep this a "basic" implementation that works on any plain WordPress
  // install. For a production app, register custom REST fields
  // (e.g. with Advanced Custom Fields) to store lat/lng as structured data.
  let content = description;
  if (capturedLocation) {
    content +=
      "\n\nLocation: Lat " + capturedLocation.lat.toFixed(5) + ", Lng " + capturedLocation.lng.toFixed(5);
  }

  // If there's a photo, upload it first, then attach it as featured_media.
  if (capturedPhotoBase64) {
    uploadPhotoThenCreatePost(title, content, categoryId, msg);
  } else {
    createIncidentPost(title, content, categoryId, null, msg);
  }
}

function uploadPhotoThenCreatePost(title, content, categoryId, msg) {
  msg.textContent = "Uploading photo...";

  // Convert base64 to a Blob so it can be sent as multipart form data.
  const byteChars = atob(capturedPhotoBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "image/jpeg" });

  const formData = new FormData();
  formData.append("file", blob, "incident-" + Date.now() + ".jpg");

  const headers = {};
  if (currentUser.token) {
    headers["Authorization"] = "Bearer " + currentUser.token;
  }

  fetch(APP_CONFIG.WP_BASE_URL + APP_CONFIG.ENDPOINTS.MEDIA, {
    method: "POST",
    headers: headers,
    body: formData,
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (mediaData) {
      createIncidentPost(title, content, categoryId, mediaData.id || null, msg);
    })
    .catch(function (err) {
      console.error("Photo upload failed", err);
      // Still create the post even if the photo upload fails.
      createIncidentPost(title, content, categoryId, null, msg);
    });
}

function createIncidentPost(title, content, categoryId, mediaId, msg) {
  const headers = { "Content-Type": "application/json" };
  if (currentUser.token) {
    headers["Authorization"] = "Bearer " + currentUser.token;
  }

  const body = {
    title: title,
    content: content,
    status: "publish", // FEATURE 3: posted automatically, visible to other users right away
    categories: [parseInt(categoryId, 10)],
  };
  if (mediaId) {
    body.featured_media = mediaId;
  }

  fetch(APP_CONFIG.WP_BASE_URL + APP_CONFIG.ENDPOINTS.POSTS, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data.id) {
        msg.textContent = "Incident submitted successfully!";
        notifyNewIncident(title); // FEATURE 4
        resetAddForm();
      } else {
        msg.textContent = data.message || "Submission failed. Please try again.";
      }
    })
    .catch(function (err) {
      msg.textContent = "Could not reach the server. Check your internet connection.";
      console.error(err);
    });
}

function resetAddForm() {
  document.getElementById("incidentTitle").value = "";
  document.getElementById("incidentDescription").value = "";
  document.getElementById("locationDisplay").textContent = "No location captured";
  document.getElementById("photoPreview").style.display = "none";
  capturedPhotoBase64 = null;
  capturedLocation = null;
}

// ===================================================================
// FEATURE 4: NOTIFY USER WHEN A NEW INCIDENT IS ADDED
// ===================================================================
// This uses a LOCAL notification, fired on this device the moment this
// user submits a report. True push notifications to OTHER users' devices
// when someone else submits a report would require a push server (e.g.
// Firebase Cloud Messaging) wired up to a WordPress webhook - that's a
// separate backend project beyond a basic Cordova app.
function notifyNewIncident(title) {
  if (window.cordova && cordova.plugins && cordova.plugins.notification) {
    cordova.plugins.notification.local.schedule({
      title: "Incident Reported",
      text: title + " has been submitted.",
      foreground: true,
    });
  } else {
    console.log("Notification: Incident Reported - " + title);
  }
}

// ===================================================================
// POLLING-BASED NOTIFICATIONS: periodically check for new posts
// ===================================================================
const POLL_INTERVAL_MS = 60 * 1000; // 60s

function startPostPolling() {
  // Run immediately, then on interval
  pollForNewIncidents();
  setInterval(pollForNewIncidents, POLL_INTERVAL_MS);
}

function pollForNewIncidents() {
  const lastSeen = parseInt(localStorage.getItem('cr_lastSeenPostId') || '0', 10);
  const url = APP_CONFIG.WP_BASE_URL + APP_CONFIG.ENDPOINTS.POSTS + '?per_page=5&_embed=1';

  fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (posts) {
      if (!Array.isArray(posts) || posts.length === 0) {
        return;
      }

      // Posts are expected newest-first; find any with id > lastSeen
      const newPosts = posts.filter(function (p) { return p.id && p.id > lastSeen; });
      if (newPosts.length === 0) return;

      // Update last seen to the highest id we received
      const maxId = Math.max.apply(null, posts.map(function(p){ return p.id || 0; }));
      localStorage.setItem('cr_lastSeenPostId', String(maxId));

      // Notify for each new post in chronological order (oldest -> newest)
      newPosts.sort(function(a,b){ return a.id - b.id; }).forEach(function(p) {
        const title = (p.title && p.title.rendered) ? stripHtml(p.title.rendered) : 'New incident';
        showIncomingIncidentNotification(title, p);
      });

      // If the browse screen is active, reload incidents so user sees updates
      const browseActive = document.getElementById('browseScreen').classList.contains('active');
      if (browseActive) loadIncidents();
    })
    .catch(function (err) {
      console.error('Polling failed', err);
    });
}

function showIncomingIncidentNotification(title, post) {
  // Reuse local notification if available
  if (window.cordova && cordova.plugins && cordova.plugins.notification) {
    cordova.plugins.notification.local.schedule({
      title: 'New Incident',
      text: title,
      foreground: true,
      data: { postId: post.id }
    });
  } else {
    // Browser fallback: log and briefly flash a message in the UI
    console.log('New Incident:', title, post);
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = 'New: ' + title;
    Object.assign(el.style, {
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      background: '#222', color: '#fff', padding: '10px 14px', borderRadius: '6px', zIndex: 9999
    });
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); }, 5000);
  }
}

// ===================================================================
// FEATURE 2 + 5 + 8: BROWSE INCIDENTS (with category filter + "my incidents")
// ===================================================================
function setupBrowseScreen() {
  document.getElementById("refreshBtn").addEventListener("click", loadIncidents);
  document.getElementById("filterCategory").addEventListener("change", loadIncidents);
  document.getElementById("myIncidentsOnly").addEventListener("change", loadIncidents);
}

function loadIncidents() {
  const listEl = document.getElementById("incidentList");
  listEl.innerHTML = '<p class="hint">Loading incidents...</p>';

  const categoryId = document.getElementById("filterCategory").value;
  const myOnly = document.getElementById("myIncidentsOnly").checked;

  let url = APP_CONFIG.WP_BASE_URL + APP_CONFIG.ENDPOINTS.POSTS + "?per_page=30&_embed=1";
  if (categoryId) {
    url += "&categories=" + categoryId;
  }
  if (myOnly && currentUser.userId) {
    url += "&author=" + currentUser.userId;
  }

  fetch(url)
    .then(function (res) {
      return res.json();
    })
    .then(function (posts) {
      renderIncidents(posts, listEl);
    })
    .catch(function (err) {
      listEl.innerHTML = '<p class="hint">Could not load incidents. Check your connection.</p>';
      console.error(err);
    });
}

function renderIncidents(posts, listEl) {
  if (!Array.isArray(posts) || posts.length === 0) {
    listEl.innerHTML = '<p class="hint">No incidents found.</p>';
    return;
  }

  listEl.innerHTML = "";

  posts.forEach(function (post) {
    const card = document.createElement("div");
    card.className = "incident-card";

    // Try to get a thumbnail from the embedded featured media.
    let imageUrl = "img/placeholder.jpg";
    if (
      post._embedded &&
      post._embedded["wp:featuredmedia"] &&
      post._embedded["wp:featuredmedia"][0] &&
      post._embedded["wp:featuredmedia"][0].source_url
    ) {
      imageUrl = post._embedded["wp:featuredmedia"][0].source_url;
    }

    // Category names from embedded terms.
    let categoryNames = [];
    if (post._embedded && post._embedded["wp:term"] && post._embedded["wp:term"][0]) {
      categoryNames = post._embedded["wp:term"][0].map(function (t) {
        return t.name;
      });
    }

    const dateStr = new Date(post.date).toLocaleDateString();
    const excerpt = stripHtml(post.excerpt ? post.excerpt.rendered : "").slice(0, 100);

    card.innerHTML =
      '<img src="' + imageUrl + '" alt="Incident photo">' +
      '<div class="info">' +
      "<h3>" + stripHtml(post.title.rendered) + "</h3>" +
      '<div class="meta">' +
      categoryNames.map(function (n) { return '<span class="badge">' + n + "</span>"; }).join("") +
      dateStr +
      "</div>" +
      "<p>" + excerpt + "...</p>" +
      "</div>";

    listEl.appendChild(card);
  });
}

function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}
