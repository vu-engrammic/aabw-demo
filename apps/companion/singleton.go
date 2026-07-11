package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

var lockFile *os.File

func acquireSingleton() bool {
	if alreadyRunning() {
		return false
	}
	path := filepath.Join(os.TempDir(), "engrammic-companion.lock")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil && os.IsExist(err) {
		_ = os.Remove(path)
		f, err = os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	}
	if err != nil {
		return false
	}
	_, _ = fmt.Fprintf(f, "%d\n", os.Getpid())
	lockFile = f
	return true
}

func releaseSingleton() {
	if lockFile != nil {
		path := lockFile.Name()
		_ = lockFile.Close()
		lockFile = nil
		_ = os.Remove(path)
	}
}

func alreadyRunning() bool {
	client := &http.Client{Timeout: 600 * time.Millisecond}
	res, err := client.Get(appURL + "health")
	if err != nil {
		return false
	}
	defer res.Body.Close()
	return res.StatusCode == http.StatusOK
}

func requestFocus() {
	client := &http.Client{Timeout: 800 * time.Millisecond}
	res, err := client.Get(appURL + "focus")
	if err == nil {
		res.Body.Close()
	}
	time.Sleep(100 * time.Millisecond)
}
