//go:build !windows

package main

import "syscall"

func windowsHideWindowAttr() *syscall.SysProcAttr {
	return nil
}
