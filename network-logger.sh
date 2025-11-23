#!/bin/bash

# Network Traffic Logger and Firewall Blocker
# Logs all network activity and blocks all network requests for 5 minutes

LOG_FILE="logs.txt"
INTERFACE="eth0"
IP_ADDRESS="10.0.3.238"  # Your IP from 'ip address' output
BLOCK_DURATION=300  # 5 minutes in seconds

# Function to start logging
start_logging() {
    echo "Starting network traffic logging to $LOG_FILE..."
    echo "Network Traffic Log - Started at $(date)" > "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
    
    sudo tcpdump -i any -n -tttt -l 2>&1 | while read line; do
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $line" >> "$LOG_FILE"
    done &
    
    TCPDUMP_PID=$!
    echo $TCPDUMP_PID > /tmp/network_logger.pid
    echo "Logging started with PID: $TCPDUMP_PID"
}

# Function to stop logging
stop_logging() {
    if [ -f /tmp/network_logger.pid ]; then
        PID=$(cat /tmp/network_logger.pid)
        sudo kill $PID 2>/dev/null
        rm /tmp/network_logger.pid
        echo "Logging stopped"
    else
        sudo killall tcpdump 2>/dev/null
        echo "Logging stopped (killed all tcpdump processes)"
    fi
}

# Function to block all network traffic
block_all_traffic() {
    echo "==================================="
    echo "BLOCKING ALL NETWORK TRAFFIC"
    echo "IP Address: $IP_ADDRESS"
    echo "Duration: 5 minutes"
    echo "==================================="
    
    # Log the action
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] All network traffic BLOCKED" >> "$LOG_FILE"
    
    # Drop all incoming traffic
    sudo iptables -I INPUT -j DROP
    
    # Drop all outgoing traffic
    sudo iptables -I OUTPUT -j DROP
    
    # Drop all forwarded traffic
    sudo iptables -I FORWARD -j DROP
    
    echo "✓ All incoming traffic blocked"
    echo "✓ All outgoing traffic blocked"
    echo "✓ All forwarded traffic blocked"
    echo ""
    echo "NO NETWORK REQUESTS CAN REACH THIS IP"
    echo ""
    
    # Show current rules
    echo "Active firewall rules:"
    sudo iptables -L -n --line-numbers | head -20
}

# Function to unblock all traffic
unblock_all_traffic() {
    echo ""
    echo "==================================="
    echo "UNBLOCKING ALL NETWORK TRAFFIC"
    echo "==================================="
    
    # Remove the DROP rules (they are at position 1)
    sudo iptables -D INPUT 1 2>/dev/null
    sudo iptables -D OUTPUT 1 2>/dev/null
    sudo iptables -D FORWARD 1 2>/dev/null
    
    echo "✓ All network traffic unblocked"
    
    # Log the action
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] All network traffic UNBLOCKED" >> "$LOG_FILE"
}

# Function to block traffic temporarily for 5 minutes
block_temp() {
    echo "==================================="
    echo "BLOCKING ALL NETWORK TRAFFIC"
    echo "Duration: 5 minutes"
    echo "Traffic will be unblocked at $(date -d '+5 minutes' '+%Y-%m-%d %H:%M:%S')"
    echo "==================================="
    
    # Block all traffic
    block_all_traffic
    
    echo ""
    echo "Waiting 5 minutes before unblocking..."
    
    # Countdown timer
    for i in {300..1}; do
        mins=$((i/60))
        secs=$((i%60))
        printf "\rTime remaining: %02d:%02d" $mins $secs
        sleep 1
    done
    
    echo ""
    echo ""
    
    # Unblock traffic
    unblock_all_traffic
    
    echo "Network traffic has been restored!"
}

# Function to block traffic in background
block_temp_bg() {
    echo "==================================="
    echo "BLOCKING ALL NETWORK TRAFFIC"
    echo "Duration: 5 minutes"
    echo "Traffic will be unblocked at $(date -d '+5 minutes' '+%Y-%m-%d %H:%M:%S')"
    echo "==================================="
    
    # Block all traffic
    block_all_traffic
    
    # Run unblock in background
    (
        sleep $BLOCK_DURATION
        
        # Unblock traffic
        sudo iptables -D INPUT 1 2>/dev/null
        sudo iptables -D OUTPUT 1 2>/dev/null
        sudo iptables -D FORWARD 1 2>/dev/null
        
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] All network traffic UNBLOCKED after 5 minutes" >> "$LOG_FILE"
    ) &
    
    echo ""
    echo "✓ Network blocked. Auto-unblock scheduled in 5 minutes (PID: $!)"
}

# Function to check firewall status
check_firewall() {
    echo "Current firewall rules:"
    echo ""
    echo "INPUT chain:"
    sudo iptables -L INPUT -n --line-numbers
    echo ""
    echo "OUTPUT chain:"
    sudo iptables -L OUTPUT -n --line-numbers
    echo ""
    echo "FORWARD chain:"
    sudo iptables -L FORWARD -n --line-numbers
}

# Main menu
case "$1" in
    start)
        start_logging
        ;;
    stop)
        stop_logging
        ;;
    block)
        block_all_traffic
        ;;
    unblock)
        unblock_all_traffic
        ;;
    block-temp)
        block_temp
        ;;
    block-bg)
        block_temp_bg
        ;;
    status)
        check_firewall
        ;;
    *)
        echo "Network Traffic Logger and Firewall Blocker"
        echo "Usage: $0 {start|stop|block|unblock|block-temp|block-bg|status}"
        echo ""
        echo "Commands:"
        echo "  start      - Start logging network traffic to $LOG_FILE"
        echo "  stop       - Stop logging network traffic"
        echo "  block      - Block ALL network traffic (permanent)"
        echo "  unblock    - Unblock all network traffic"
        echo "  block-temp - Block traffic for 5 mins (with countdown)"
        echo "  block-bg   - Block traffic for 5 mins (background)"
        echo "  status     - Show current firewall rules"
        echo ""
        echo "IP Address: $IP_ADDRESS"
        echo "Block duration: 5 minutes"
        echo ""
        echo "⚠️  WARNING: This will block ALL network traffic!"
        exit 1
        ;;
esac