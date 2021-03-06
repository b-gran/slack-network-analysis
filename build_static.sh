#!/usr/bin/env bash

#

# DEFINE_SCRIPT_DIR([script_dir])
# ARG_POSITIONAL_SINGLE([server],[Which server to serialize data from])
# ARG_POSITIONAL_SINGLE([graph_id],[Id of the graph to use static data for])
# ARG_HELP([Generate a build of SNA using static data])
# ARGBASH_SET_INDENT([  ])
# ARGBASH_GO()
# needed because of Argbash --> m4_ignore([
### START OF CODE GENERATED BY Argbash v2.7.1 one line above ###
# Argbash is a bash code generator used to get arguments parsing right.
# Argbash is FREE SOFTWARE, see https://argbash.io for more info


die()
{
  local _ret=$2
  test -n "$_ret" || _ret=1
  test "$_PRINT_HELP" = yes && print_help >&2
  echo "$1" >&2
  exit ${_ret}
}


begins_with_short_option()
{
  local first_option all_short_options='h'
  first_option="${1:0:1}"
  test "$all_short_options" = "${all_short_options/$first_option/}" && return 1 || return 0
}

# THE DEFAULTS INITIALIZATION - POSITIONALS
_positionals=()
# THE DEFAULTS INITIALIZATION - OPTIONALS


print_help()
{
  printf '%s\n' "Generate a build of SNA using static data"
  printf 'Usage: %s [-h|--help] <server> <graph_id>\n' "$0"
  printf '\t%s\n' "<server>: Which server to serialize data from"
  printf '\t%s\n' "<graph_id>: Id of the graph to use static data for"
  printf '\t%s\n' "-h, --help: Prints help"
}


parse_commandline()
{
  _positionals_count=0
  while test $# -gt 0
  do
    _key="$1"
    case "$_key" in
      -h|--help)
        print_help
        exit 0
        ;;
      -h*)
        print_help
        exit 0
        ;;
      *)
        _last_positional="$1"
        _positionals+=("$_last_positional")
        _positionals_count=$((_positionals_count + 1))
        ;;
    esac
    shift
  done
}


handle_passed_args_count()
{
  local _required_args_string="'server' and 'graph_id'"
  test "${_positionals_count}" -ge 2 || _PRINT_HELP=yes die "FATAL ERROR: Not enough positional arguments - we require exactly 2 (namely: $_required_args_string), but got only ${_positionals_count}." 1
  test "${_positionals_count}" -le 2 || _PRINT_HELP=yes die "FATAL ERROR: There were spurious positional arguments --- we expect exactly 2 (namely: $_required_args_string), but got ${_positionals_count} (the last one was: '${_last_positional}')." 1
}


assign_positional_args()
{
  local _positional_name _shift_for=$1
  _positional_names="_arg_server _arg_graph_id "

  shift "$_shift_for"
  for _positional_name in ${_positional_names}
  do
    test $# -gt 0 || break
    eval "$_positional_name=\${1}" || die "Error during argument parsing, possibly an Argbash bug." 1
    shift
  done
}

parse_commandline "$@"
handle_passed_args_count
assign_positional_args 1 "${_positionals[@]}"

# OTHER STUFF GENERATED BY Argbash
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || die "Couldn't determine the script's running directory, which probably matters, bailing out" 2

### END OF CODE GENERATED BY Argbash (sortof) ### ])
# [ <-- needed because of Argbash


set -e
TEMP_DATA_FILE=${script_dir}/_tmp_data.json

echo "Serializing data for graph ${_arg_graph_id} from ${_arg_server}..."
node ${script_dir}/serializeGraphData.js ${_arg_graph_id} \
    --server ${_arg_server} \
    --output ${TEMP_DATA_FILE}

# We need to run a next build before exporting because the export step looks for
# a particular file in the .next/ directory.
echo Running next build...
STATIC_DATA_SOURCE=${TEMP_DATA_FILE} ${script_dir}/node_modules/.bin/next \
    build ${script_dir}/src/frontend

# Run the actual export task.
echo Exporting application...
STATIC_DATA_SOURCE=${TEMP_DATA_FILE} ${script_dir}/node_modules/.bin/next \
    export ${script_dir}/src/frontend \
    -o ${script_dir}/dist

echo Removing temp data file...
rm ${TEMP_DATA_FILE}

# ] <-- needed because of Argbash
