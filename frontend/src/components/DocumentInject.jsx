import React, { useState, useEffect, useRef } from "react";
import uploadIcon from "../assets/upload.png";

const DocumentInject = () => {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const progressRef = useRef(progress); // Track latest progress for smoothing

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async () => {
    if (!text && !file) {
      alert("Please provide text or upload a file");
      return;
    }

    setLoading(true);
    setProgress(0);
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);

    try {
      const API_BASE = "http://localhost:8000";

      if (file) {
        const allowedTypes = [".pdf", ".docx", ".xlsx", ".txt"];
        const fileExt = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        if (!allowedTypes.includes(fileExt)) {
          alert("Unsupported file type. Allowed: PDF, DOCX, XLSX, TXT");
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("session_id", newSessionId);

        const response = await fetch(`${API_BASE}/upload_file?session_id=${newSessionId}`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
        const result = await response.json();
        alert(result.message || "File uploaded and indexed successfully!");
      } else {
        const response = await fetch(`${API_BASE}/index_text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, session_id: newSessionId }),
        });

        if (!response.ok) throw new Error(`Indexing failed: ${response.statusText}`);
        const result = await response.json();
        alert(result.message || "Text indexed successfully!");
      }

      setText("");
      setFile(null);
    } catch (error) {
      console.error("Error:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setSessionId(null);
    }
  };

  // Smooth progress bar updates
  useEffect(() => {
    if (!sessionId || !loading) return;

    const eventSource = new EventSource(`http://localhost:8000/progress/${sessionId}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          console.error("Progress error:", data.error);
          return;
        }
        let targetProgress = Math.min((data.processed / data.total) * 100, 100);
        if (data.processed >= data.total) {
          targetProgress = 100; // Force to 100% on completion
        }
        
        // Smoothly animate to target progress
        let startProgress = progressRef.current;
        const duration = 500; // Increased duration for smoother animation
        const startTime = performance.now();

        const animateProgress = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progressFraction = Math.min(elapsed / duration, 1);
          // Ease-in-out for smoother animation
          const ease = progressFraction < 0.5 ? 2 * progressFraction * progressFraction : 1 - Math.pow(-2 * progressFraction + 2, 2) / 2;
          const easedProgress = startProgress + (targetProgress - startProgress) * ease;
          setProgress(easedProgress);
          progressRef.current = easedProgress;

          if (progressFraction < 1) {
            requestAnimationFrame(animateProgress);
          } else if (targetProgress === 100) {
            setProgress(100); // Ensure final snap to 100%
          }
        };

        requestAnimationFrame(animateProgress);
      } catch (e) {
        console.error("Error parsing progress:", e);
      }
    };

    eventSource.onerror = () => {
      console.error("EventSource error");
      eventSource.close();
      setProgress(100); // Fallback to 100% on error
    };

    return () => {
      eventSource.close();
      if (progressRef.current < 100) {
        setProgress(100); // Ensure completion on cleanup
      }
    };
  }, [sessionId, loading]);

  return (
    <div className="content-area">
      <div className="main-content">
        <h1>Document <span>Inject</span></h1>
        <p>Upload your document or paste the content below.</p>

        {/* Upload Box */}
        <label className="upload-box">
          <img src={uploadIcon} alt="Upload" />
          <p>{file ? file.name : "Click to upload PDF, DOCX, XLSX or TXT file"}</p>
          <input
            type="file"
            accept=".pdf,.docx,.xlsx,.txt"
            className="file-input"
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>

        {/* Text Area */}
        <textarea
          className="form-control"
          rows={6}
          placeholder="Paste document content here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />

        {/* Progress Bar */}
        {loading && (
          <div className="progress-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="progress-text">{Math.round(progress)}% Complete</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          className="btn-primary btn-wide"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Processing..." : "Index Document"}
        </button>
      </div>
    </div>
  );
};

export default DocumentInject;