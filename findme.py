import json
import sys
import os
import argparse
import requests
from jsonschema import validate, ValidationError
from concurrent.futures import ThreadPoolExecutor, as_completed
from termcolor import colored

def get_data_file_path(filename):
    """Get the path to data files - checks multiple locations."""
    
    possible_paths = [
        filename,
        os.path.join(os.path.dirname(os.path.abspath(__file__)), filename),
        os.path.join(os.path.dirname(__file__), filename),
    ]
    
    try:
        import site

        for site_dir in site.getsitepackages():
            possible_paths.append(os.path.join(site_dir, filename))
        
        user_site = site.getusersitepackages()
        if user_site:
            possible_paths.append(os.path.join(user_site, filename))
    except:
        pass
    
    possible_paths.extend([
        os.path.join(sys.prefix, filename),
        os.path.join(sys.prefix, 'share', filename),
        os.path.join(sys.prefix, 'lib', filename),
    ])
    
    # Try each path
    for path in possible_paths:
        if os.path.exists(path):
            return path
    
    raise FileNotFoundError(
        f"Cannot find {filename}. Searched in:\n" + 
        "\n".join(f"  - {p}" for p in possible_paths[:5])
    )


def load_targets(json_file, schema_file):
    """Load and validate the target platforms from a JSON file."""
    try:
        json_path = get_data_file_path(json_file)
        schema_path = get_data_file_path(schema_file)
    except FileNotFoundError as e:
        print(colored(f"Error: {e}", "red"))
        print(colored("\nThis usually means the package wasn't installed correctly.", "yellow"))
        print(colored("Try reinstalling: pip install --force-reinstall findme-osint", "yellow"))
        exit(1)

    with open(json_path, 'r') as file:
        data = json.load(file)

    with open(schema_path, 'r') as schema:
        schema_data = json.load(schema)
        try:
            validate(instance=data, schema=schema_data)
        except ValidationError as e:
            print(f"Schema validation error: {e}")
            exit(1)

    return data


def check_username(platform, username):
    """Check if a username exists on a platform."""
    url = platform["url"].format(username)
    try:
        response = requests.get(url, headers=platform.get("headers", {}), timeout=5)
        if response.status_code in [403, 404]:
            return None  
        if platform["errorType"] == "status_code":
            if response.status_code == 200:
                return url
        elif platform["errorType"] == "message":
            error_msgs = platform["errorMsg"]
            error_msgs = error_msgs if isinstance(error_msgs, list) else [error_msgs]
            for msg in error_msgs:
                if msg in response.text:
                    return None
            return url
    except Exception:
        return None


def check_availability(platform, username):
    """Check if a username is AVAILABLE on a platform (inverse logic).
    Returns the platform URL if the username is NOT found (available for registration).
    
    Uses check_username and inverts the result:
    - If check_username finds the account → username is TAKEN (return None)
    - If check_username doesn't find the account → username is AVAILABLE (return URL)
    """
    # Use the existing check_username function
    found_url = check_username(platform, username)
    
    if found_url:
        # Username EXISTS on this platform = NOT available
        return None
    else:
        # Username NOT FOUND on this platform = AVAILABLE
        url = platform["url"].format(username)
        return url


def search_username_concurrently(username, platforms, max_threads=10, show_progress=True, mode="discover"):
    """Search for a username across multiple platforms using threading.
    
    Args:
        mode: 'discover' to find where username exists, 'availability' to find where it's available
    """
    results = []
    

    valid_platforms = {name: platform for name, platform in platforms.items() if not name.startswith("$")}
    total_platforms = len(valid_platforms)
    completed = 0
    found_count = 0
    
    # Choose the check function based on mode
    check_func = check_availability if mode == "availability" else check_username
    mode_label = "Available" if mode == "availability" else "Found"
    mode_color = "cyan" if mode == "availability" else "green"
    
    if show_progress and total_platforms > 0:
        action_text = "Checking availability" if mode == "availability" else "Searching"
        print(colored(f"{action_text} across {total_platforms} platforms...\n", "cyan"))
    
    with ThreadPoolExecutor(max_threads) as executor:
        future_to_platform = {
            executor.submit(check_func, platform, username): name
            for name, platform in valid_platforms.items()
        }
        
        for future in as_completed(future_to_platform):
            platform_name = future_to_platform[future]
            completed += 1
            
            try:
                result = future.result()
                if result:
                    results.append((platform_name, result))
                    found_count += 1
                    status_icon = colored('✓', mode_color)
                    status_text = colored(mode_label.upper(), mode_color)
                else:
                    not_label = "TAKEN" if mode == "availability" else "NOT FOUND"
                    status_icon = colored('○', 'yellow')
                    status_text = colored(not_label, 'yellow')
            except Exception:
                status_icon = colored('✗', 'red')
                status_text = colored('ERROR', 'red')
            
            if show_progress and total_platforms > 0:
                
                percentage = (completed / total_platforms) * 100
                progress_bar_length = 40
                filled = int(progress_bar_length * completed / total_platforms)
                bar = '█' * filled + '░' * (progress_bar_length - filled)
            
                progress_line = (
                    f"\r[{bar}] {percentage:.1f}% | "
                    f"{status_icon} {platform_name[:20]:20s} | "
                    f"Completed: {completed}/{total_platforms} | "
                    f"{mode_label}: {colored(str(found_count), mode_color)}"
                )
                sys.stdout.write(progress_line)
                sys.stdout.flush()
    
    if show_progress and total_platforms > 0:
        
        bar = '█' * 40
        final_line = (
            f"\r[{bar}] 100.0% | "
            f"Completed: {total_platforms}/{total_platforms} | "
            f"{mode_label}: {colored(str(found_count), mode_color)}/{total_platforms}"
        )
        sys.stdout.write(final_line)
        sys.stdout.flush()
        print("\n")  
    
    return results


def print_banner():
    """Print the banner with styled text."""
    banner = (
        "\033[1;32m"  
        "\n"
        "╭─────[By 0xSaikat]───────────────────────────────────╮\n"
        "│                                                     │\n"
        "│         _______           ____  _________           │\n"
        "│        / ____(_)___  ____/ /  |/  / ____/           │\n"
        "│       / /_  / / __ \\/ __  / /|_/ / __/              │\n"
        "│      / __/ / / / / / /_/ / /  / / /___              │\n"
        "│     /_/   /_/_/ /_/\\__,_/_/  /_/_____/  PRO V-2.0   │\n"
        "│                                                     │\n"
        "╰─────────────────────────────────[hackbit.org]───────╯\n"
        "\033[0m"  
    )
    print(banner)


def main():
    parser = argparse.ArgumentParser(
        description="FindMe Pro - Social Media Username Search & Availability Checker"
    )
    parser.add_argument(
        "--mode", "-m",
        choices=["discover", "availability"],
        default="discover",
        help="Search mode: 'discover' to find existing accounts (default), 'availability' to find available usernames"
    )
    args = parser.parse_args()
    
    print_banner()
    print()  
    
    # Show mode information
    if args.mode == "availability":
        print(colored("[PRO]", "cyan", attrs=["bold"]) + colored(" Availability Check Mode", "cyan"))
        print(colored("      Finding platforms where the username is AVAILABLE for registration\n", "white"))
    else:
        print(colored("[*] Discovery Mode - Finding existing accounts\n", "green"))

    platforms = load_targets("data.json", "data.schema.json")
    username = input(colored("[", "green") + colored("*", "red") + colored("]", "green") + " Enter username to search: ")
    
    if args.mode == "availability":
        print(colored("\n[", "cyan") + colored("*", "yellow") + colored("] Checking availability of ", "cyan", attrs=["bold"]) + colored(username, "yellow", attrs=["bold"]) + colored(" on:\n", "cyan", attrs=["bold"]))
    else:
        print(colored("\n[", "green") + colored("*", "red") + colored("] Checking username ", "green", attrs=["bold"]) + colored(username, "red", attrs=["bold"]) + colored(" on:\n", "green", attrs=["bold"]))

    results = search_username_concurrently(username, platforms, show_progress=True, mode=args.mode)
    
    if results:
        if args.mode == "availability":
            print(colored(f"\n🎉 Username '{username}' is AVAILABLE on {len(results)} platforms:\n", "cyan", attrs=["bold"]))
            for platform_name, url in results:
                print(f"{colored('[', 'cyan')}{colored('✓', 'green')}{colored(']', 'cyan')} {colored(platform_name, 'cyan', attrs=['bold'])}: {url}")
        else:
            print()
            for platform_name, url in results:
                print(f"{colored('[', 'green')}{colored('+', 'red')}{colored(']', 'green')} {colored(platform_name, 'green', attrs=['bold'])}: {url}")
    else:
        if args.mode == "availability":
            print(colored("[-] Username is taken on all checked platforms.", "red", attrs=["bold"]))
        else:
            print(colored("[-] No accounts found.", "red", attrs=["bold"]))

    print("\n" + colored("[", "green") + colored("*", "red") + colored("]", "green") + " " + colored("Search completed.", "green", attrs=["bold"]))



if __name__ == "__main__":
    main()
