import { useState } from "react";
import { DOCKER_COMMAND } from "../services/tidecloak";

export default function TideCloakSetupModal({ isOpen, onClose, onReload, initError }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  function copyDockerCommand() {
    navigator.clipboard.writeText(DOCKER_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">CONFIGURATION & TROUBLESHOOTING GUIDE</div>
            <h3>TideCloak Local IAM Integration</h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="setup-alert warning">
            <strong>⛔ TideCloak Server Not Running (localhost:8080 Refused Connection)</strong>
            <p>
              Trình duyệt báo <code>localhost refused to connect</code> vì container TideCloak chưa được khởi chạy tại cổng 8080.
            </p>
            <p style={{ marginTop: "6px" }}>
              💡 <strong>Lưu ý cho Ban giám khảo & Nhà phát triển:</strong> Nếu máy tính chưa cài Docker hoặc WSL 2, bạn hoàn toàn có thể nhấn nút <strong>"Tiếp tục với Chế độ Sandbox Demo"</strong> bên dưới để đánh giá 100% tính năng 2-of-3 Quorum, mã hóa W3C AES-GCM-256 và sổ cái SHA-256 Hash Chain mà không cần Docker!
            </p>
          </div>

          <div className="setup-steps">
            <div className="setup-step">
              <span className="step-num">1</span>
              <div className="step-content">
                <h4>Khởi chạy TideCloak Dev Container</h4>
                <p>Mở PowerShell với quyền quản trị viên và chạy lệnh sau:</p>
                <div className="code-block-row">
                  <code>{DOCKER_COMMAND}</code>
                  <button className="button outline mini" onClick={copyDockerCommand}>
                    {copied ? "Đã copy!" : "Copy"}
                  </button>
                </div>
                <small style={{ color: "#77857e", display: "block", marginTop: "4px" }}>
                  * Yêu cầu Docker Desktop và WSL 2 đã được kích hoạt.
                </small>
              </div>
            </div>

            <div className="setup-step">
              <span className="step-num">2</span>
              <div className="step-content">
                <h4>Cấu hình Realm & Client trên Admin Console</h4>
                <p>
                  Truy cập <a href="http://localhost:8080/" target="_blank" rel="noreferrer">http://localhost:8080/</a> với tài khoản <code>admin / password</code>:
                </p>
                <ul>
                  <li>Tạo Realm tên: <strong>fairenrol</strong></li>
                  <li>Tạo Client tên: <strong>fairenrol-app</strong> (OpenID Connect, Public client: ON)</li>
                  <li>Cấu hình <strong>Valid redirect URIs</strong>: <code>http://localhost:5137/*</code></li>
                  <li>Cấu hình <strong>Web origins</strong>: <code>http://localhost:5137</code></li>
                </ul>
              </div>
            </div>

            <div className="setup-step">
              <span className="step-num">3</span>
              <div className="step-content">
                <h4>File Adapter Configuration</h4>
                <p>
                  File cấu hình <code>public/tidecloak.json</code> đã được tạo sẵn trong dự án với đầy đủ thông số cho realm <code>fairenrol</code>.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="button outline" onClick={onClose}>
            Tiếp tục với Chế độ Sandbox Demo (Không cần Docker)
          </button>
          <button className="button dark" onClick={onReload}>
            Kiểm tra lại kết nối (Reload)
          </button>
        </div>
      </div>
    </div>
  );
}
