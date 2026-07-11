package main

import (
	"embed"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"
)

//go:embed ui/*
var ui embed.FS

const (
	port    = "8792"
	gateway = "http://127.0.0.1:8790"
	appURL  = "http://127.0.0.1:" + port + "/"
)

var (
	windowMu     sync.Mutex
	windowOpened bool
)

func main() {
	if !acquireSingleton() {
		requestFocus()
		return
	}
	defer releaseSingleton()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"service":"engrammic-companion"}`))
	})
	mux.HandleFunc("/focus", func(w http.ResponseWriter, _ *http.Request) {
		openWindowOnce(appURL)
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/stream", proxyStream)
	mux.HandleFunc("/state", proxyState)
	mux.Handle("/api/", http.StripPrefix("/api", gatewayProxy()))
	sub, err := fs.Sub(ui, "ui")
	if err != nil {
		log.Fatal(err)
	}
	mux.Handle("/", http.FileServer(http.FS(sub)))

	go openWindowOnce(appURL)

	addr := "127.0.0.1:" + port
	log.Printf("Engrammic companion on %s", appURL)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func gatewayProxy() http.Handler {
	target, _ := url.Parse(gateway)
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.Director = func(req *http.Request) {
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		req.Host = target.Host
	}
	proxy.ModifyResponse = func(res *http.Response) error {
		res.Header.Set("Access-Control-Allow-Origin", "http://127.0.0.1:"+port)
		res.Header.Set("Access-Control-Allow-Credentials", "true")
		if cookies := res.Header.Values("Set-Cookie"); len(cookies) > 0 {
			res.Header.Del("Set-Cookie")
			for _, c := range cookies {
				res.Header.Add("Set-Cookie", c)
			}
		}
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		http.Error(w, err.Error(), http.StatusBadGateway)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:"+port)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "content-type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		proxy.ServeHTTP(w, r)
	})
}

func proxyState(w http.ResponseWriter, _ *http.Request) {
	res, err := http.Get(gateway + "/live/state")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer res.Body.Close()
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(res.StatusCode)
	_, _ = io.Copy(w, res.Body)
}

func proxyStream(w http.ResponseWriter, r *http.Request) {
	up, err := http.NewRequestWithContext(r.Context(), http.MethodGet, gateway+"/live/stream", nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	up.Header.Set("accept", "text/event-stream")

	client := &http.Client{Timeout: 0}
	res, err := client.Do(up)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer res.Body.Close()

	w.Header().Set("content-type", "text/event-stream")
	w.Header().Set("cache-control", "no-cache")
	w.Header().Set("connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "stream unsupported", http.StatusInternalServerError)
		return
	}

	buf := make([]byte, 4096)
	for {
		n, readErr := res.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				return
			}
			flusher.Flush()
		}
		if readErr != nil {
			return
		}
	}
}

func openWindowOnce(url string) {
	windowMu.Lock()
	defer windowMu.Unlock()
	if windowOpened {
		return
	}
	windowOpened = true
	go openWindow(url)
}

func openWindow(url string) {
	time.Sleep(300 * time.Millisecond)
	switch runtime.GOOS {
	case "windows":
		for _, browser := range []string{
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("LocalAppData"), "Google", "Chrome", "Application", "chrome.exe"),
		} {
			if _, err := os.Stat(browser); err == nil {
				cmd := exec.Command(browser, "--app="+url, "--window-size=480,820")
				if attr := hideWindowAttr(); attr != nil {
					cmd.SysProcAttr = attr
				}
				_ = cmd.Start()
				return
			}
		}
		_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		_ = exec.Command("open", "-a", "Google Chrome", "--args", "--app="+url).Start()
	default:
		_ = exec.Command("xdg-open", url).Start()
	}
}

func hideWindowAttr() *syscall.SysProcAttr {
	return windowsHideWindowAttr()
}
