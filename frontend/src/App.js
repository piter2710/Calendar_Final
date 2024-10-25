import { useEffect, useState } from "react";
import google_img from "./google.webp";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import "./App.css";
import { Doughnut } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from "chart.js";
ChartJS.register(ArcElement, Tooltip, Legend, Title);

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // const { isAuthenticated, setIsAuthenticated } = useAuth();
  const [activeStartDate, setActiveStartDate] = useState(new Date());
  const [eventDetails, setEventDetails] = useState({
    id: null,
    summary: "",
    startDate: "",
    startHour: "10",
    startMinute: "0",
    endDate: "",
    endHour: "10",
    endMinute: "0",
  });
  const [events, setEvents] = useState([]);
  const [singleEvent, setSingleEvent] = useState(null);

  const handleLogout = () => {
    const confirmLogout = window.confirm("Czy na pewno chcesz się wylogować?");
    if (!confirmLogout) {
      return; // User canceled logout
    }

    // Clear admin status and tokens from localStorage
    setIsAdmin(false);
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');

    // Redirect to home page (or any other page you prefer)
    window.location.replace("http://localhost:3000/");
  };
  const handleMonthChange = (date) => {
    setActiveStartDate(date);
  };
  const handleChange = (e) => {
    const { name, value } = e.target;
    setEventDetails((prevDetails) => ({
      ...prevDetails,
      [name]: value,
    }));
  };

  const handleSending = async (summary, start, end, action) => {
    try {
      const res = await fetch("http://localhost:8000/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: summary,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          action: action,
        }),
      });
    } catch (error) {
      console.log(error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const {
      summary,
      startDate,
      startHour,
      startMinute,
      endDate,
      endHour,
      endMinute,
    } = eventDetails;

    const start = new Date(
        `${startDate}T${String(startHour).padStart(2, "0")}:${String(
            startMinute
        ).padStart(2, "0")}:00`
    );
    const end = new Date(
        `${endDate}T${String(endHour).padStart(2, "0")}:${String(
            endMinute
        ).padStart(2, "0")}:00`
    );

    if (end <= start) {
      alert("Data Końcowa musi być po dacie początkowej!");
      return;
    }

    // Check for overlapping events
    const isOverlapping = events.some((event) => {
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      return (
          (start >= eventStart && start < eventEnd) ||
          (end > eventStart && end <= eventEnd) ||
          (start <= eventStart && end >= eventEnd)
      );
    });

    if(isOverlapping) {
      alert("Daty nachodzą na siebie!");
      return;
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      alert("Zła data początkowa lub końcowa");
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/calendar/events/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create event");
      }

      const newEvent = await res.json();
      setEvents((prevEvents) => [...prevEvents, newEvent]);
      handleSending(summary, start, end, "Created");

      setEventDetails({
        id: null,
        summary: "",
        startDate: "",
        startHour: "10",
        startMinute: "0",
        endDate: "",
        endHour: "10",
        endMinute: "0",
      });
    } catch (error) {
      console.error(error);
    }
  };
  const fetchSingleEvent = async (event_id) => {
    try {
      const res = await fetch(
          `http://localhost:8000/calendar/event/${event_id}`
      );
      if (!res.ok) {
        throw new Error("Failed to fetch single event");
      }
      const data = await res.json();
      console.log("Single data: ", data);
      setSingleEvent(data);
    } catch (error) {
      console.error("Error fetching single event:", error);
    }
  };
  const fetchEvents = async () => {
    try {
      const response = await fetch("http://localhost:8000/calendar/events");
      if (response.status === 204) {
        console.log("No events found.");
        setEvents([]);
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      setEvents(data);
      console.log("This is all data", data);
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };
  useEffect(() => {
    fetchEvents();
    const intervalId = setInterval(() => {
      fetchEvents();
    }, 5000);
    return () => clearInterval(intervalId);
  }, []);
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("http://localhost:8000/auth/check");
        const data = await res.json();
        console.log(data);
        if (data.authenticated) {
          setIsAuthenticated(true);
          fetchEvents();
          console.log("Auth fetching");
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Error checking authentication: ", error);
        setIsAuthenticated(false);
      }
    }

    checkAuth();
  }, [isAuthenticated]);
  useEffect(() => {
    console.log("Updated events:", events);
  }, [events]);

  function handleLogin() {
    window.location.replace("http://localhost:8000/auth/login");
  }
  const handleDateChange = (date) => {
    const adjustedDate = new Date(date);
    adjustedDate.setHours(0, 0, 0, 0);
    setSelectedDate(adjustedDate);
    adjustedDate.setDate(adjustedDate.getDate() + 1);
    setEventDetails((prev) => ({
      ...prev,
      startDate: adjustedDate.toISOString().split("T")[0],
      endDate: adjustedDate.toISOString().split("T")[0],
    }));
  };
  const getEventsForDate = (date) => {
    return events.filter((event) => {
      const eventStartDate = new Date(event.start.dateTime);
      return eventStartDate.toDateString() === date.toDateString();
    });
  };
  return (
      <Router>
        <div className="App">
          <Routes>
            <Route
                path="/admin"
                element={
                  <Admin
                      isAuthenticated={isAuthenticated}
                      events={events}
                      handleSubmit={handleSubmit}
                      setEvents={setEvents}
                      getEventsForDate={getEventsForDate}
                      setIsAuthenticated={setIsAuthenticated}
                      setIsAdmin={setIsAdmin}
                      isAdmin={isAdmin}
                      handleLogout={handleLogout}
                      handleMonthChange={handleMonthChange}
                      handleChange={handleChange}
                      eventDetails={eventDetails}
                      setEventDetails={setEventDetails}
                      singleEvent={singleEvent}
                      setSingleEvent={setSingleEvent}
                      handleSending={handleSending}
                  />
                }
            />
            <Route
                path="/"
                element={
                  isAuthenticated ? (
                      <div className="container">
                        {isAdmin ? <p className="role">Admin</p> : null}
                        {console.log("the user is admin: ", isAdmin)}
                        <CalendarMain
                            handleDateChange={handleDateChange}
                            activeStartDate={activeStartDate}
                            eventDetails={eventDetails}
                            getEventsForDate={getEventsForDate}
                            handleMonthChange={handleMonthChange}
                        />
                        <CalendarForm
                            eventDetails={eventDetails}
                            handleChange={handleChange}
                            handleSubmit={handleSubmit}
                        />
                      </div>
                  ) : (
                      <div className="google-container">
                        <p className="login-text">Nie jesteś zalogowany</p>
                        <img className="google-img"
                             src={google_img}
                             alt="Logo google"
                             onClick={handleLogin}
                        />
                        <p className="login-info">Kliknij na obrazek by się zalogować</p>
                      </div>
                  )
                }
            />
          </Routes>
        </div>
      </Router>
  );
}
const CalendarMain = ({
                        eventDetails,
                        activeStartDate,
                        handleDateChange,
                        handleMonthChange,
                        getEventsForDate,
                      }) => {
  return (
      <div className="Calendar">
        <Calendar
            className="react-calendar custom-calendar"
            activeStartDate={activeStartDate}
            onActiveStartDateChange={({ activeStartDate }) => {
              handleMonthChange(activeStartDate);
            }}
            onChange={handleDateChange}
            tileContent={({ date }) => {
              const eventsForDate = getEventsForDate(date);
              return (
                  <div>
                    {eventsForDate.map((eventDetails, index) => {
                      const startDate = new Date(eventDetails.start.dateTime);
                      const endDate = new Date(eventDetails.end.dateTime);
                      const formattedStartTime = startDate.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const formattedEndTime = endDate.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                          <div key={index} className="eventTile">
                    <span>
                      {formattedStartTime} - {formattedEndTime}
                    </span>
                          </div>
                      );
                    })}
                  </div>
              );
            }}
        />
      </div>
  );
};
const CalendarForm = ({ eventDetails, handleChange, handleSubmit }) => {
  return (
      <div className="EventForm">
        <form onSubmit={handleSubmit}>
          <h1>Dodaj Wydarzenie</h1>
          <label>
            Tytuł
            <input
                type="text"
                name="summary"
                value={eventDetails.summary}
                onChange={handleChange}
                required
            />
          </label>

          <h3>Wybierz Date i Godzinę Początkową</h3>
          <label>
            Data Początkowa:
            <input
                type="date"
                name="startDate"
                value={eventDetails.startDate}
                onChange={handleChange}
                required
            />
          </label>
          <label>
            Godzina Początkowa
            <select
                name="startHour"
                value={eventDetails.startHour}
                onChange={handleChange}
                required
            >
              {[...Array(10).keys()].map((i) => (
                  <option key={i + 10} value={i + 10}>
                    {i + 10}
                  </option>
              ))}
            </select>
          </label>
          <label>
            Minuta Początkowa:
            <select
                name="startMinute"
                value={eventDetails.startMinute}
                onChange={handleChange}
                required
            >
              {[...Array(60).keys()].map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
              ))}
            </select>
          </label>

          <h3>Wybierz Datę i Godzinę Końcową</h3>
          <label>
            End Date:
            <input
                type="date"
                name="endDate"
                value={eventDetails.endDate}
                onChange={handleChange}
                required
            />
          </label>
          <label>
            Godzina Końcowa
            <select
                name="endHour"
                value={eventDetails.endHour}
                onChange={handleChange}
                required
            >
              {[...Array(10).keys()].map((i) => (
                  <option key={i + 10} value={i + 10}>
                    {i + 10}
                  </option>
              ))}
            </select>
          </label>
          <label>
            Minuta Końcowa
            <select
                name="endMinute"
                value={eventDetails.endMinute}
                onChange={handleChange}
                required
            >
              {[...Array(60).keys()].map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
              ))}
            </select>
          </label>

          <button type="submit">Dodaj</button>
        </form>
      </div>
  );
};

function Admin({
                 setIsAdmin,
                 isAdmin,
                 handleLogout,
                 getEventsForDate,
                 setIsAuthenticated,
                 isAuthenticated,
                 handleSubmit,
                 events,
                 setEvents,
                 handleMonthChange,
                 handleChange,
                 eventDetails,
                 setEventDetails,
                 setSingleEvent,
                 handleSending,
               }) {
  const [isOpenCreate, setIsOpenCreate] = useState(false);
  const [token, setToken] = useState('')
  const [isButtonClicked, setIsButtonClicked] = useState(false)
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [lastEvents, setLastEvents] = useState([]);
  const [editingEventId, setEditingEventId] = useState(null);
  const [activeStartDate, setActiveStartDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [data, setData] = useState({
    total_events: 0,
    added_events: 0,
    deleted_events: 0,
  });
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});

  const toggleEdit = () => {
    setIsEditing(!isEditing);
  };
  const fetchEventData = async () => {
    try {
      const response = await fetch("http://localhost:8000/event/count");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };
  useEffect(() => {
    const adminStatus = localStorage.getItem('isAdmin');
    if (adminStatus === 'true') {
      setIsAdmin(true);
    }
  }, []);

  useEffect(() => {
    const adminStatus = localStorage.getItem('isAdmin');
    if (adminStatus === 'true') {
      setIsAdmin(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const response = await fetch('http://localhost:8000/loginAdmin/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams ({
        username: username,
        password: password,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setIsAdmin(data.is_admin); // Use the returned is_admin value
      localStorage.setItem('isAdmin', data.is_admin); // Persist isAdmin status
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('refreshToken', data.refresh_token);
      console.log("Logged in successfully:", data);
    } else {
      console.error("Login failed");
    }
  };


  const validateForm = () => {
    const newErrors = {};
    if (!createUsername) newErrors.createUsername = 'Username is required';
    if (!createPassword) newErrors.createPassword = 'Password is required';
    if (createPassword !== createConfirmPassword) newErrors.createConfirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitCreate = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      await handleCreateAdmin(createUsername, createPassword);
    }
  };
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEvents();
    }, 15000);

    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    async function getLatestEvents() {
      try {
        const res = await fetch("http://localhost:8000/events");
        if (!res.status === 200) {
          throw new Error("Couldn't fetch events");
        }
        const data = await res.json();
        setLastEvents(data);
        console.log(lastEvents);
      } catch (error) {
        console.error(error);
      }
    }

    getLatestEvents();
    console.log(lastEvents);
    const intervalId = setInterval(() => {
      getLatestEvents();
      console.log("Data fetched in interval: ", lastEvents);
    }, 5000);
    return () => clearInterval(intervalId);
  }, []);
  const handleCreateAdmin = async (username, password) => {
    try{
    const res = await fetch("http://localhost:8000/create_admin/", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username,
        password: password,
      })

    });
    if (!res.ok){
      throw new Error("Couldn't create admin");
    }
    setIsOpenCreate(false);
    } catch (error){
      console.error(error);
    }
  }
  const handleDeleteEvent = async (eventId) => {
    try {
      const response = await fetch(
          `http://localhost:8000/calendar/event/${eventId}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch single event");
      }
      const data = await response.json();
      console.log("Single data: ", data);
      setSingleEvent(data);

      // Proceed with deletion
      const deleteResponse = await fetch(
          `http://localhost:8000/calendar/events/${eventId}`,
          {
            method: "DELETE",
          }
      );

      if (!deleteResponse.ok) {
        throw new Error("Failed to delete event");
      }

      console.log("Deleting singleEvent data:", data);

      const startDateTime = data.start.dateTime;
      const endDateTime = data.end.dateTime;

      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);

      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
        handleSending(
            data.summary,
            startDate.toISOString(),
            endDate.toISOString(),
            "DELETED"
        );
      } else {
        console.error("Invalid date for sending:", startDateTime, endDateTime);
      }

      setEvents((prevEvents) =>
          prevEvents.filter((event) => event.id !== eventId)
      );
      fetchEvents()
      setSingleEvent(null);
    } catch (error) {
      console.error("Error:", error);
    }
  };
  const handleUpdate = async (e, eventId) => {
    e.preventDefault();
    const {
      summary,
      startDate,
      startHour,
      startMinute,
      endDate,
      endHour,
      endMinute,
    } = eventDetails;
    const start = new Date(`${startDate}T${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}:00`).toISOString();
    const end = new Date(`${endDate}T${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}:00`).toISOString();
    if (end <= start) {
      alert("Data końcowa musi być po dacie początkowej!");
      return;
    }

    try {
      const res = await fetch(`http://localhost:8000/update_event/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: eventId,
          summary,
          start: {
            dateTime: start,
            timeZone: "Europe/Warsaw",
          },
          end: {
            dateTime: end,
            timeZone: "Europe/Warsaw",
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update event");
      }

      const updatedEvent = await res.json();
      alert("Zaktualizowano Wydarzenie!");
      handleFormCloseClick()
      console.log("Updated event data:", updatedEvent);

      const updatedEventsResponse = await fetch(
          "http://localhost:8000/calendar/events"
      );
      if (!updatedEventsResponse.ok) {
        throw new Error("Failed to fetch updated events");
      }
      const updatedEvents = await updatedEventsResponse.json();
      setEvents(updatedEvents);

      setEventDetails({
        id: null,
        summary: "",
        startDate: "",
        startHour: "10",
        startMinute: "0",
        endDate: "",
        endHour: "10",
        endMinute: "0",
      });
    } catch (error) {
      console.error("Error updating event:", error);
    }
  };

  const handleEditButtonClick = async (eventId) => {
    try {
      const response = await fetch(
          `http://localhost:8000/calendar/event/${eventId}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch event details");
      }
      const eventData = await response.json();

      setEventDetails({
        id: eventData.id,
        summary: eventData.summary,
        startDate: new Date(eventData.start.dateTime)
            .toISOString()
            .split("T")[0],
        startHour: new Date(eventData.start.dateTime).getHours(),
        startMinute: new Date(eventData.start.dateTime).getMinutes(),
        endDate: new Date(eventData.end.dateTime).toISOString().split("T")[0],
        endHour: new Date(eventData.end.dateTime).getHours(),
        endMinute: new Date(eventData.end.dateTime).getMinutes(),
      });
      setIsButtonClicked(true)
      setEditingEventId(eventId);
      setIsEditing(true);

    } catch (error) {
      console.error("Error fetching event data:", error);
    }
  };


  const fetchEvents = async () => {
    try {
      const response = await fetch("http://localhost:8000/calendar/events");
      if (!response.ok) throw new Error("Failed to fetch events");
      const data = await response.json();
      setEvents(data);
      console.log("This is all data", data);
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };
  const handleDateChange = (date) => {
    const adjustedDate = new Date(date);
    adjustedDate.setDate(adjustedDate.getDate() + 1);
    setSelectedDate(adjustedDate);

    const formattedDate = adjustedDate.toISOString().split("T")[0];
    setEventDetails((prev) => ({
      ...prev,
      startDate: formattedDate,
      endDate: formattedDate,
    }));
  };
  const handleDeleteAll = async () => {
    const confirmDelete = window.confirm(
        "Czy na pewno chcesz usunąć wszystkie wydarzenia?"
    );
    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch("http://localhost:8000/calendar/events/", {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to delete events: ${errorData}`);
      }

      const data = await response.json();
      const deletedCount = data["deleted_count"];

      setData((prevState) => ({
        total_events: prevState.total_events + deletedCount,
        added_events: prevState.added_events,
        deleted_events: prevState.deleted_events + deletedCount,
      }));

      setEvents([]);
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };

  const deleteHistory = async () => {
    const confirmDelete = window.confirm(
        "Czy na pewno chcesz usunąć historie wydarzeń? "
    );
    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch("http://localhost:8000/events/history/", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Nieudało się usunąć histori");
      }
      setLastEvents([]);
    } catch (error) {
      console.error(error);
    }
  };
  const handleFormCloseClick = () => {
    setEditingEventId(null);
    setIsEditing(false);
    setIsButtonClicked(false)
  };
  const handleGoogleLogout = async () => {
    const confirmLogout = window.confirm(
        "Czy na pewno chcesz się wylogować?"
    );
    if (!confirmLogout) {
      return;
    }
    try {
      const response = await fetch('http://localhost:8000/google_logout/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      window.location.replace("http://localhost:3000")
    } catch (error) {
      console.error('Error during logout:', error);
      alert('An error occurred during logout.');
    }
  };
  function handleGoogleLogin(){
    window.location.replace("http://localhost:3000/")
  }
  const deleteHistoryElement = async (eventId) =>{
    try{
      const res = await fetch(`http://localhost:8000/events/history/${eventId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        throw new Error("Failed to delete element");
      }
    } catch (error){
      console.error("Error:", error);
    }
  }
const toggleIsOpenCreate = () =>{
  setIsOpenCreate(true)

}
  return (
      <div className="admin-container">
        {isAdmin ? (
            <>
              <div className="admin-message">
                <p className="admin-text">Jesteś zalogowany jako Administrator. </p>
                <button className="logout-btn" onClick={handleLogout}>
                  Wyloguj się
                </button>


              </div>
              <div className="admin-message">
                <p className="admin-text">Google: {isAuthenticated ? <><span>Jesteś zalogowany </span>
                      <button className="logout-btn" onClick={handleGoogleLogout}>
                        Wyloguj się z Google
                      </button> </>:
                    <><span>Jesteś wylogowany </span>
                      <button className="login-btn" onClick={handleGoogleLogin}>
                        Zaloguj się do Google
                      </button> </>} </p>

              </div>

              <div className="divider"></div>
              {isAuthenticated ? ( <>
              <CalendarMain
                  handleDateChange={handleDateChange}
                  activeStartDate={activeStartDate}
                  events={events}
                  getEventsForDate={getEventsForDate}
                  handleMonthChange={handleMonthChange}
              />
              <CalendarForm
                  eventDetails={eventDetails}
                  handleChange={handleChange}
                  handleSubmit={handleSubmit}
              />

              <EventDonutChart data={data} fetchEventData={fetchEventData}/> <br/>
              <br/>
              <br/>
              <br/>
              <div>
                <h2 className="form-title">Aktualne Wydarzenia</h2>
                {events.length != 0 ? <button className="delete-history" onClick={handleDeleteAll}>
                  Usuń Wszystkie Wydarzenia
                </button> : ""}

              </div>
              <ul className="event-list">
                {events.map((event) => {
                  const dataStartObj = new Date(event.start.dateTime);
                  const dataEndObj = new Date(event.end.dateTime);

                  const options = {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  };

                  const formattedStart = dataStartObj.toLocaleString("pl-PL", options);
                  const formattedEnd = dataEndObj.toLocaleString("pl-PL", options);

                  return (
                      <li className="event-item" key={event.id}>
            <span className="event-summary">
              {event.summary}: {formattedStart} - {formattedEnd}
            </span>
                        {!isButtonClicked && <button className="event-action-btn Edit-btn" onClick={() => handleEditButtonClick(event.id)}> Edytuj
                        </button>}

                        {isEditing && editingEventId === event.id && (
                            <>
                              <UpdateCalendarForm
                                  eventDetails={eventDetails}
                                  handleChange={handleChange}
                                  handleUpdate={handleUpdate}
                                  eventId={event.id}
                                  onClose={handleFormCloseClick}
                              /> &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</>
                        )}
                        <button
                            className="event-action-btn delete-btn"
                            onClick={() => handleDeleteEvent(event.id)}
                        >
                          Usuń
                        </button>

                      </li>
                  );
                })}
              </ul>
              <hr/>
              <h2>Historia Dodawanych i Usuwanych wydarzeń</h2>{" "}

              {lastEvents.length > 0 ? <button className="delete-history" onClick={deleteHistory}>Usuń Historię Wydarzeń</button> : ""}
              {Array.isArray(lastEvents) && lastEvents.length > 0 ? (

                  lastEvents.map((event) => (
                      <div key={event.id}>
                        <h2>{event.title}</h2>
                        <p>Akcja: {event.action}</p>
                        

                        <button className="event-action-btn delete-btn" onClick={() => deleteHistoryElement(event.id)}>Usuń ten element z histori</button>
                        <hr/>
                      </div>
                  ))
              ) : (
                  <p>No events available.</p>
              )}</> ): ""}
            </>
        ) : (
            <form className="login-form" onSubmit={handleLogin}>
              <h2 className="login-title">Logowanie Admina</h2>
              <label className="form-label">
                Nazwa użytkownika:
                <input
                    className="form-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                />
              </label>
              <label className="form-label">
                Hasło:
                <input
                    className="form-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
              </label>
              <button className="login-btn" type="submit">
                Zaloguj
              </button>
            </form>
        )}
      </div>
  );
}
const UpdateCalendarForm = ({
                              eventDetails,
                              handleChange,
                              handleUpdate,
                              eventId,
                              onClose
                            }) => {
  const onSubmit = (e) => handleUpdate(e, eventId);
  {
    console.log("Event details from update: ", eventDetails);
  }
  return (
      <div className="UpdateEventForm">
        <form onSubmit={onSubmit} className="update-event-form">
          <h1 className="update-form-title">Aktualizuj Wydarzenie</h1>

          <div className="form-group">
            <label className="update-form-label">
              Tytuł &nbsp; &nbsp;
              <input
                  type="text"
                  name="summary"
                  value={eventDetails.summary}
                  onChange={handleChange}
                  required
                  className="update-form-input"
              />
            </label>
          </div>

          <h3 className="date-time-header">Wybierz Date i Godzinę Początkową</h3>
          <div className="form-group">
            <label className="update-form-label">
              Data Początkowa:
              <input
                  type="date"
                  name="startDate"
                  value={eventDetails.startDate}
                  onChange={handleChange}
                  required
                  className="update-form-input date-input"
              />
            </label>
            <label className="update-form-label">
              Godzina Początkowa
              <select
                  name="startHour"
                  value={eventDetails.startHour}
                  onChange={handleChange}
                  required
                  className="update-form-select"
              >
                {[...Array(24).keys()].map((i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}
                    </option>
                ))}
              </select>
            </label>
            <label className="update-form-label">
              Minuta Początkowa:
              <select
                  name="startMinute"
                  value={eventDetails.startMinute}
                  onChange={handleChange}
                  required
                  className="update-form-select"
              >
                {[...Array(60).keys()].map((i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}
                    </option>
                ))}
              </select>
            </label>
          </div>

          <h3 className="date-time-header">Wybierz Datę i Godzinę Końcową</h3>
          <div className="form-group">
            <label className="update-form-label">
              Data Końcowa:
              <input
                  type="date"
                  name="endDate"
                  value={eventDetails.endDate}
                  onChange={handleChange}
                  required
                  className="update-form-input date-input"
              />
            </label>
            <label className="update-form-label">
              Godzina Końcowa
              <select
                  name="endHour"
                  value={eventDetails.endHour}
                  onChange={handleChange}
                  required
                  className="update-form-select"
              >
                {[...Array(24).keys()].map((i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}
                    </option>
                ))}
              </select>
            </label>
            <label className="update-form-label">
              Minuta Końcowa:
              <select
                  name="endMinute"
                  value={eventDetails.endMinute}
                  onChange={handleChange}
                  required
                  className="update-form-select"
              >
                {[...Array(60).keys()].map((i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}
                    </option>
                ))}
              </select>
            </label>
          </div>

          <div className="button-group">
            <button type="button" className="update-close-button" onClick={onClose}>Zamknij</button>
            <button type="submit" className="update-submit-button">Zaktualizuj</button>
          </div>
        </form>
      </div>


  );
};

const EventDonutChart = ({data, fetchEventData}) => {
  useEffect(() => {
    fetchEventData();
    const intervalId = setInterval(() => {
      fetchEventData();
    }, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const chartData = {
    labels: ["Utworzone Wydarzenia", "Usunięte Wydarzenia"],
    datasets: [
      {
        data: [data.added_events, data.deleted_events],
        backgroundColor: ["#36A2EB", "#FF6384"],
        hoverBackgroundColor: ["#36A2EB", "#FF6384"],
        borderWidth: 2,
        borderColor: "#fff",
      },
    ],
  };

  const options = {
    responsive: true,
    cutout: "70%",
    plugins: {
      legend: {
        display: true,
        position: "top",
      },
      tooltip: {
        callbacks: {
          label: (tooltipItem) => {
            const label = tooltipItem.label;
            const count = tooltipItem.raw;
            return `${label}: ${count} (${(
                (count / data.total_events) *
                100
            ).toFixed(1)}%)`;
          },
        },
        padding: 35,
        titleFont: {
          size: 16,
          weight: "bold",
        },
        bodyFont: {
          size: 14,
        },
      },
      datalabels: {
        display: true,
        color: "black",
        formatter: (value, context) => {
          return value;
        },
        anchor: "end",
        align: "end",
        offset: -35,
        font: {
          size: 18,
          weight: "bold",
        },
      },
    },
  };

  return (
      <div style={{width: "100%", maxWidth: "500px", maxHeight: "300px", margin: "0 auto"}}>
        <h3>Ilość Akcji na Wydarzeniach: {data.total_events}</h3>
        <Doughnut
            data={chartData}
            options={options}
            plugins={[ChartDataLabels]}
        />
      </div>
  );
};
export default App;

