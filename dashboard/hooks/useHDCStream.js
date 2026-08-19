import { useState, useEffect, useRef } from "react";

export function useHDCStream(wsUrl = "ws://localhost:8080", isFrozen = false) {
  const [packet, setPacket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hardwareStatus, setHardwareStatus] = useState("ONLINE");
  const [fps, setFps] = useState(0);
  const [totalPackets, setTotalPackets] = useState(0);
  const [latency, setLatency] = useState(0);

  const frameCount = useRef(0);
  const wsRef = useRef(null);
  const isFrozenRef = useRef(isFrozen);

  useEffect(() => {
    isFrozenRef.current = isFrozen;
  }, [isFrozen]);

  useEffect(() => {
    const fpsInterval = setInterval(() => {
      setFps(frameCount.current);
      frameCount.current = 0;
    }, 1000);

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setHardwareStatus("ONLINE");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.packetType === 0) {
            setHardwareStatus(data.systemStatus || "ONLINE");
            setIsConnected(true);
            return;
          }

          if (data.packetType !== 1 || isFrozenRef.current) return;

          const now = Date.now();
          frameCount.current += 1;
          setTotalPackets((prev) => prev + 1);
          setLatency(Math.max(1, now - data.timestamp));
          setPacket(data);
        } catch (e) {
          console.error("Failed to parse WS packet", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setHardwareStatus("HARDWARE_DISCONNECTED");
        setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearInterval(fpsInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, [wsUrl]);

  return {
    packet,
    isConnected,
    hardwareStatus,
    fps,
    totalPackets,
    latency,
  };
}
