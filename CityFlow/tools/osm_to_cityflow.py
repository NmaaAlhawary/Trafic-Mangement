import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path("/Users/namaaalhawary/Desktop/Traffic/CityFlow")
CONVERTER = ROOT / "tools" / "converter" / "converter.py"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert an OSM map into SUMO net.xml and CityFlow roadnet.json."
    )
    parser.add_argument(
        "--osm",
        default=str(ROOT / "map.osm"),
        help="Input OSM file path",
    )
    parser.add_argument(
        "--output-dir",
        default=str(ROOT / "build" / "real_map"),
        help="Directory for generated SUMO/CityFlow artifacts",
    )
    parser.add_argument(
        "--sumo-home",
        default=os.environ.get("SUMO_HOME", ""),
        help="SUMO installation root used to locate netconvert and SUMO Python tools",
    )
    parser.add_argument(
        "--copy-to-frontend",
        action="store_true",
        help="Copy the converted CityFlow roadnet into frontend/testdata/real_map_roadnet.json",
    )
    return parser.parse_args()


def find_netconvert(sumo_home: str) -> str | None:
    netconvert = shutil.which("netconvert")
    if netconvert:
        return netconvert
    if sumo_home:
        candidate = Path(sumo_home) / "bin" / "netconvert"
        if candidate.exists():
            return str(candidate)
    return None


def run(cmd, env=None):
    print("RUN:", " ".join(map(str, cmd)))
    subprocess.run(cmd, check=True, env=env)


def main():
    args = parse_args()
    osm_path = Path(args.osm).resolve()
    out_dir = Path(args.output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if not osm_path.exists():
        raise SystemExit(f"OSM file not found: {osm_path}")

    netconvert = find_netconvert(args.sumo_home)
    if not netconvert:
        raise SystemExit(
            "SUMO netconvert not found. Install SUMO and set SUMO_HOME, or ensure netconvert is on PATH."
        )

    sumo_net = out_dir / f"{osm_path.stem}.net.xml"
    cityflow_net = out_dir / "roadnet.json"

    env = os.environ.copy()
    if args.sumo_home:
        env["SUMO_HOME"] = args.sumo_home

    run(
        [
            netconvert,
            "--osm-files",
            str(osm_path),
            "--output-file",
            str(sumo_net),
            "--geometry.remove",
            "--ramps.guess",
            "--roundabouts.guess",
            "--junctions.join",
            "--tls.guess-signals",
            "--tls.discard-simple",
            "--keep-edges.by-vclass",
            "passenger",
        ],
        env=env,
    )

    run(
        [
            sys.executable,
            str(CONVERTER),
            "--sumonet",
            str(sumo_net),
            "--cityflownet",
            str(cityflow_net),
        ],
        env=env,
    )

    if args.copy_to_frontend:
        frontend_target = ROOT / "frontend" / "testdata" / "real_map_roadnet.json"
        frontend_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(cityflow_net, frontend_target)
        print(f"Copied frontend roadnet to {frontend_target}")

    print(f"SUMO net: {sumo_net}")
    print(f"CityFlow roadnet: {cityflow_net}")
    print("Note: OSM -> CityFlow gives a real road network, but replay traffic still requires a flow/replay generation step.")


if __name__ == "__main__":
    main()
